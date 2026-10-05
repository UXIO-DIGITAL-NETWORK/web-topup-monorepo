import { api } from "@/lib/axios";
import { API_VERSION } from "@/config/env";
import { toRowId, unwrapPaginated } from "@/lib/apiMappers";
import type { ApiResponse, PaginatedResponse } from "@/types/api.type";
import type {
  ActivityLogEntry,
  PaymentStatus,
  ProviderStatus,
  RecapPeriod,
  StatusCounts,
  Transaction,
  TransactionCustomer,
  TransactionDetail,
  TransactionListParams,
  TransactionRecap,
  TransactionStatus,
} from "../types/transaction.type";

const BASE = `${API_VERSION}/transactions`;

/**
 * The API's transaction status enum, mapped onto this feature's vocabulary.
 *
 * `PAID` collapses into `pending`: the customer has paid but the supplier has
 * not started, which is exactly what the Pending pill means to an operator.
 * `EXPIRED` and `FAILED_PROVIDER` both read as `failed` — the distinction
 * (never paid vs paid-then-failed) is carried by the payment status column.
 */
const INVOICE_STATUS: Record<string, TransactionStatus> = {
  PENDING: "pending",
  PAID: "pending",
  PROCESSING: "processing",
  COMPLETED: "success",
  FAILED_PROVIDER: "failed",
  EXPIRED: "failed",
  REFUNDED: "refunded",
};

/** `payments.status` is stored as a numeric string — see App\Enums\PaymentStatus. */
const PAYMENT_STATUS: Record<string, TransactionStatus> = {
  "1": "pending",
  "2": "failed",
  "3": "success",
  "4": "refunded",
};

/** `GatewayStatus` words, as served by the split-aware API. */
const API_PAYMENT_STATUS: Record<string, PaymentStatus> = {
  PENDING: "pending",
  SUCCESS: "success",
  EXPIRED: "expired",
  REFUNDED: "refunded",
};

/** `ProviderStatus` values, as served by the split-aware API. */
const API_PROVIDER_STATUS: Record<string, ProviderStatus> = {
  NOT_ORDERED: "not_ordered",
  QUEUED: "queued",
  SENDING: "sending",
  ORDERED: "ordered",
  UNCONFIRMED: "unconfirmed",
  DELIVERED: "delivered",
  REJECTED: "rejected",
  UNDELIVERED: "undelivered",
};

/**
 * The fold the API now does for us, kept here as a fallback.
 *
 * The three repos deploy independently, so this SPA has to render correctly
 * against an API that has not shipped the split yet. It is coarser by necessity
 * — a list row carries no `supplier_trx_id` — but it is never wrong, only less
 * specific.
 */
const LEGACY_PROVIDER_STATUS: Record<string, ProviderStatus> = {
  PENDING: "not_ordered",
  EXPIRED: "not_ordered",
  PAID: "queued",
  PROCESSING: "ordered",
  COMPLETED: "delivered",
  FAILED_PROVIDER: "rejected",
  REFUNDED: "undelivered",
};

/** Sent back to the API when filtering. */
const TO_API_PAYMENT_STATUS: Record<PaymentStatus, string> = {
  pending: "PENDING",
  success: "SUCCESS",
  expired: "EXPIRED",
  refunded: "REFUNDED",
  // Not a gateway state — it selects orders with no payment row at all.
  none: "NONE",
};

const TO_API_PROVIDER_STATUS: Record<ProviderStatus, string> = {
  not_ordered: "NOT_ORDERED",
  queued: "QUEUED",
  sending: "SENDING",
  ordered: "ORDERED",
  unconfirmed: "UNCONFIRMED",
  delivered: "DELIVERED",
  rejected: "REJECTED",
  undelivered: "UNDELIVERED",
};

/** The reverse direction, for writes. */
const TO_API_STATUS: Partial<Record<TransactionStatus, string>> = {
  pending: "PENDING",
  processing: "PROCESSING",
  success: "COMPLETED",
  failed: "FAILED_PROVIDER",
  refunded: "REFUNDED",
};

/**
 * Columns the API will sort by. `user`, `product` and `target_ref` live across
 * a join and are not in the backend's whitelist, so they are dropped rather
 * than silently sorting by something else.
 */
const SORTABLE: Record<string, string> = {
  invoice_no: "invoice_number",
  cost: "amount_total",
  status: "status",
  time: "created_at",
};

interface TransactionApiRow {
  id: number;
  invoice_number: string;
  user_id: number | null;
  guest_contact: string | null;
  contact_email: string | null;
  target_uid: string | null;
  target_server: string | null;
  target_nickname?: string | null;
  amount_fee: number;
  amount_total: number;
  margin: number;
  status: string;
  sn: string | null;
  proof_url: string | null;
  user?: { id: number; name: string; phone: string; email?: string | null; avatar_url: string | null } | null;
  product?: { id: number; name: string; category?: { id: number; name: string } | null } | null;
  payment?: { status: string } | null;
  /** Both added by the status split. Optional: absent when the API predates it. */
  provider_status?: string | null;
  payment_status?: string | null;
  payment_channel?: { id: number; name: string } | null;
  /**
   * One entry per supplier order placed. Present since mixes shipped: an
   * ordinary product has exactly one, a mix has one per component — and the
   * columns above describe only the first of them.
   */
  supplier_orders?: {
    id: number;
    product_code: string | null;
    product_name: string | null;
    buyer_sku_code: string;
    idtrx: string;
    supplier_trx_id: string | null;
    supplier_status: string | null;
    provider_status: string | null;
    sn: string | null;
    attempts?: number;
    supplier_id?: number | null;
    supplier_name?: string | null;
    retried_by?: string | null;
    retried_at?: string | null;
    last_error?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }[];
  created_at: string;
  updated_at: string;
}

/**
 * What `GET /v1/transactions/{id}` returns on top of the list row. Extends the
 * list shape so the fields both reads share are declared exactly once.
 *
 * `total_price` is deliberately absent: the API writes it only for
 * admin-created rows, so it is 0 on every customer order.
 */
interface TransactionDetailApiRow extends TransactionApiRow {
  amount_base: number;
  channel_fee: number;
  discount_amount: number;
  is_manual: boolean;
  supplier_trx_id: string | null;
  supplier_status: string | null;
  supplier?: { id: number; name: string } | null;
  payment?: {
    status: string;
    reference_id?: string | null;
    pg_transaction_id?: string | null;
    gross_amount?: number | null;
    paid_at?: string | null;
  } | null;
}

/** Guests have no user row; their contact lives on the transaction itself. */
const toCustomer = (row: TransactionApiRow): TransactionCustomer => ({
  user_id: row.user_id,
  name: row.user?.name ?? "Guest",
  phone: row.user?.phone ?? row.guest_contact ?? "",
  email: row.user?.email ?? row.contact_email ?? undefined,
  avatar_url: row.user?.avatar_url ?? undefined,
});

const toTargetRef = (row: TransactionApiRow): string | undefined =>
  [row.target_uid, row.target_server].filter(Boolean).join(" / ") || undefined;

const toInvoiceStatus = (row: TransactionApiRow): TransactionStatus => INVOICE_STATUS[row.status] ?? "pending";

const toPaymentStatus = (row: TransactionApiRow): PaymentStatus => {
  const fromApi = API_PAYMENT_STATUS[row.payment_status ?? ""];
  if (fromApi) return fromApi;

  // Pre-split API: the numeric code on the nested payment row.
  const legacy = PAYMENT_STATUS[row.payment?.status ?? ""];
  if (legacy === "failed") return "expired";
  if (legacy === "success" || legacy === "refunded" || legacy === "pending") return legacy;

  // No payment row at all is a real answer, not a pending one.
  return row.payment ? "pending" : "none";
};

const toProviderStatus = (row: TransactionApiRow): ProviderStatus =>
  API_PROVIDER_STATUS[row.provider_status ?? ""] ?? LEGACY_PROVIDER_STATUS[row.status] ?? "not_ordered";

const toGame = (row: TransactionApiRow) => ({
  id: toRowId(row.product?.category?.id ?? 0),
  name: row.product?.category?.name ?? "",
});

const toProductRef = (row: TransactionApiRow) => ({
  id: toRowId(row.product?.id ?? 0),
  name: row.product?.name ?? "",
});

interface RecapApiShape {
  generated_at: string;
  breakdown?: { label: string; count: number; revenue: number }[];
  total_count?: number;
  total_revenue?: number;
}

const toTransaction = (row: TransactionApiRow): Transaction => {
  const invoiceStatus = toInvoiceStatus(row);
  const isTerminal = invoiceStatus === "success" || invoiceStatus === "failed" || invoiceStatus === "refunded";

  return {
    id: toRowId(row.id),
    invoice_no: row.invoice_number,
    payment_status: toPaymentStatus(row),
    provider_status: toProviderStatus(row),
    invoice_status: invoiceStatus,
    customer: toCustomer(row),
    game: toGame(row),
    product: toProductRef(row),
    // `cost` is the customer's total, not the upstream cost — the column
    // header reads "Cost" but the reference's figures are the amount billed.
    cost: row.amount_total,
    profit: row.margin,
    admin_fee: row.amount_fee,
    target_ref: toTargetRef(row),
    nickname: row.target_nickname ?? undefined,
    payment_method: row.payment_channel?.name ?? "",
    serial_number: row.sn ?? undefined,
    proof_url: row.proof_url ?? undefined,
    created_at: row.created_at,
    // The API has no resolved_at column; once a transaction reaches a terminal
    // state its last write *is* the resolution, so updated_at stands in.
    resolved_at: isTerminal ? row.updated_at : undefined,
    elapsed_seconds: isTerminal
      ? Math.max(0, Math.round((Date.parse(row.updated_at) - Date.parse(row.created_at)) / 1000))
      : undefined,
    activity_log: [],
    updated_at: row.updated_at,
  };
};

/**
 * The detail dialog's shape. Shares every derivation with `toTransaction` via
 * the helpers above, so the status-folding and guest-fallback rules cannot
 * drift between the table and the dialog.
 */
const toTransactionDetail = (row: TransactionDetailApiRow): TransactionDetail => ({
  id: toRowId(row.id),
  invoice_no: row.invoice_number,
  invoice_status: toInvoiceStatus(row),
  payment_status: toPaymentStatus(row),
  provider_status: toProviderStatus(row),
  is_manual: Boolean(row.is_manual),
  customer: toCustomer(row),
  game: toGame(row),
  product: toProductRef(row),
  target_ref: toTargetRef(row),
  target_uid: row.target_uid ?? undefined,
  target_server: row.target_server ?? undefined,
  nickname: row.target_nickname ?? undefined,
  serial_number: row.sn ?? undefined,
  proof_url: row.proof_url ?? undefined,
  amount_base: row.amount_base,
  discount_amount: row.discount_amount ?? 0,
  amount_fee: row.amount_fee,
  channel_fee: row.channel_fee,
  amount_total: row.amount_total,
  margin: row.margin,
  payment_method: row.payment_channel?.name ?? "",
  payment: {
    reference_id: row.payment?.reference_id ?? undefined,
    pg_transaction_id: row.payment?.pg_transaction_id ?? undefined,
    gross_amount: row.payment?.gross_amount ?? undefined,
    paid_at: row.payment?.paid_at ?? undefined,
  },
  supplier: {
    name: row.supplier?.name ?? undefined,
    trx_id: row.supplier_trx_id ?? undefined,
    status: row.supplier_status ?? undefined,
    orders: (row.supplier_orders ?? []).map((order) => ({
      id: toRowId(order.id),
      code: order.product_code ?? undefined,
      name: order.product_name ?? undefined,
      provider_status: (order.provider_status ?? undefined) as ProviderStatus | undefined,
      status: order.supplier_status ?? undefined,
      sn: order.sn ?? undefined,
      supplier: order.supplier_name ?? undefined,
      idtrx: order.idtrx || undefined,
      attempts: order.attempts ?? undefined,
      last_error: order.last_error ?? undefined,
      created_at: order.created_at ?? undefined,
      updated_at: order.updated_at ?? undefined,
      retried_by: order.retried_by ?? undefined,
      retried_at: order.retried_at ?? undefined,
    })),
  },
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/**
 * `ref` is whatever the route carries, and the edit route is keyed on the
 * invoice number — the identifier an operator can actually read off a receipt.
 * The API binds `{transaction}` to the numeric id, so a non-numeric ref is
 * resolved through a search instead of 404ing.
 *
 * Shared by `getById` and `getDetail` so the two reads cannot disagree about
 * how a ref is resolved.
 */
const fetchTransactionRow = async <T extends TransactionApiRow>(ref: string): Promise<T> => {
  if (/^\d+$/.test(ref)) {
    const response: ApiResponse<T> = await api.get(`${BASE}/${ref}`);
    return response.data;
  }

  const response: ApiResponse<PaginatedResponse<T>> = await api.get(BASE, {
    params: { search: ref, per_page: 1 },
  });

  const found = response.data.data[0];
  if (!found) throw new Error(`No transaction found for: ${ref}`);
  return found;
};

const toListParams = (params: TransactionListParams) => ({
  ...(params.search && { search: params.search }),
  ...(params.userId && { user_id: params.userId }),
  ...(params.productId && { product_id: params.productId }),
  ...(params.paymentMethod && { payment_channel_id: params.paymentMethod }),
  ...(params.invoiceStatus && { status: TO_API_STATUS[params.invoiceStatus] }),
  // Both of these used to go nowhere: the Payment Status dropdown wrote to
  // local state and was never serialized, and the API had no parameter for it.
  ...(params.paymentStatus && { payment_status: TO_API_PAYMENT_STATUS[params.paymentStatus] }),
  ...(params.providerStatus && { provider_status: TO_API_PROVIDER_STATUS[params.providerStatus] }),
  ...(params.startDate && { start_date: params.startDate }),
  ...(params.endDate && { end_date: params.endDate }),
  ...(params.page && { page: params.page }),
  ...(params.per_page && { per_page: params.per_page }),
  ...(params.sortBy && SORTABLE[params.sortBy] ? { sort_by: SORTABLE[params.sortBy] } : {}),
  ...(params.sortDir && { sort_dir: params.sortDir }),
});

export const transactionsService = {
  list: async (params: TransactionListParams): Promise<PaginatedResponse<Transaction>> => {
    const response: ApiResponse<PaginatedResponse<TransactionApiRow>> = await api.get(BASE, {
      params: toListParams(params),
    });
    return unwrapPaginated(response, toTransaction);
  },

  /**
   * `ref` is whatever the route carries, and the edit route is keyed on the
   * invoice number — the identifier an operator can actually read off a
   * receipt. The API binds `{transaction}` to the numeric id, so a non-numeric
   * ref is resolved through a search instead of 404ing.
   */
  getById: async (ref: string): Promise<Transaction> => toTransaction(await fetchTransactionRow<TransactionApiRow>(ref)),

  /**
   * The read-only detail dialog. Same endpoint as `getById`, but keeps the
   * wider payload the table row discards.
   */
  getDetail: async (ref: string): Promise<TransactionDetail> =>
    toTransactionDetail(await fetchTransactionRow<TransactionDetailApiRow>(ref)),

  /**
   * Scoped by `activity_logs.transaction_id`. The admin's row id is the
   * transaction's own id, so an invoice-number ref is resolved first.
   */
  getActivityLog: async (id: string): Promise<ActivityLogEntry[]> => {
    const transactionId = /^\d+$/.test(id) ? id : (await transactionsService.getById(id)).id;

    const response: ApiResponse<
      PaginatedResponse<{ id: number; actor: string; message: string; created_at: string }>
    > = await api.get(`${API_VERSION}/activity-logs`, {
      params: { transaction_id: transactionId, per_page: 50 },
    });

    return response.data.data.map((row) => ({
      id: toRowId(row.id),
      actor: row.actor === "System" ? "system" : { name: row.actor },
      // The table stores one human-readable sentence; there is no separate
      // short label to split off, so the sentence is the description and the
      // action column carries a constant.
      action: "Activity",
      description: row.message,
      created_at: row.created_at,
    }));
  },

  getStatusCounts: async (): Promise<StatusCounts> => {
    const response: ApiResponse<{
      pending: number;
      processing: number;
      failed_provider: number;
      // The per-lifecycle breakdowns are nested and additive — the four flat
      // keys above are frozen so this page keeps working across a deploy where
      // only one of the two repos has shipped.
      provider?: Record<string, number>;
      payment?: Record<string, number>;
    }> = await api.get(`${BASE}/status-counts`);

    return {
      pending: response.data.pending,
      processing: response.data.processing,
      failed: response.data.failed_provider,
      provider: response.data.provider as StatusCounts["provider"],
      payment: response.data.payment as StatusCounts["payment"],
    };
  },

  edit: async (id: string, formData: FormData): Promise<Transaction> => {
    // The API marks amount_base and status required on update, so the edit
    // form's three fields have to be merged onto the current row first.
    const current = await transactionsService.getById(id);
    const invoiceStatus = (formData.get("invoiceStatus") as TransactionStatus | null) ?? current.invoice_status;
    const serialNumber = formData.get("serialNumber");
    const proof = formData.get("proof");

    // A proof upload goes through manual-review — the only endpoint that
    // accepts a file.
    if (proof instanceof File) {
      const reviewForm = new FormData();
      reviewForm.append("proof", proof);
      reviewForm.append("status", TO_API_STATUS[invoiceStatus] ?? "PENDING");
      await api.post(`${BASE}/${id}/manual-review`, reviewForm);
    }

    const response: ApiResponse<TransactionApiRow> = await api.put(`${BASE}/${id}`, {
      amount_base: current.cost - (current.admin_fee ?? 0),
      amount_fee: current.admin_fee ?? 0,
      amount_total: current.cost,
      status: TO_API_STATUS[invoiceStatus] ?? "PENDING",
      ...(serialNumber !== null && { sn: String(serialNumber) }),
    });

    return toTransaction(response.data);
  },

  refund: async (id: string, reason: string): Promise<void> => {
    if (!reason.trim()) throw new Error("A refund reason is required");
    await api.post(`${BASE}/${id}/refund`, { reason });
  },

  resendCallback: async (id: string): Promise<void> => {
    await api.post(`${BASE}/${id}/resend-callback`);
  },

  /** Rehit ONE sub-order of a mix with the supplier, from its row. */
  resendSupplierOrder: async (id: string, orderId: string): Promise<void> => {
    await api.post(`${BASE}/${id}/supplier-orders/${orderId}/resend`);
  },

  retryInvoice: async (id: string): Promise<void> => {
    await api.post(`${BASE}/${id}/retry`);
  },

  /** Re-sends the transaction receipt to the customer (product_requirements.md §4.3). */
  resendReceipt: async (id: string): Promise<void> => {
    await api.post(`${BASE}/${id}/resend-receipt`);
  },

  /**
   * Downloads the current filtered set (product_requirements.md §4.3). Pagination
   * is dropped so the export covers every matching row, not just the page. The
   * axios interceptor unwraps `response.data`, so the blob is returned directly.
   */
  exportTransactions: async (params: TransactionListParams, format: "csv" = "csv"): Promise<Blob> => {
    const { page: _page, per_page: _perPage, ...rest } = params;
    void _page;
    void _perPage;
    const blob: Blob = await api.get(`${BASE}/export`, {
      params: { ...toListParams(rest), format },
      responseType: "blob",
    });
    return blob;
  },

  /**
   * Daily/monthly recap with a per-group breakdown (product_requirements.md
   * §4.3). The API is assumed to return the aggregation already grouped; the
   * mapper just normalises the field names and derives the totals footer when
   * the backend omits it.
   */
  getRecap: async (period: RecapPeriod = "daily"): Promise<TransactionRecap> => {
    const response: ApiResponse<RecapApiShape> = await api.get(`${BASE}/recap`, { params: { period } });
    const data = response.data;
    const rows = (data.breakdown ?? []).map((row) => ({
      label: row.label,
      count: row.count,
      revenue: row.revenue,
    }));
    return {
      period,
      generated_at: data.generated_at,
      rows,
      totals: {
        count: data.total_count ?? rows.reduce((sum, row) => sum + row.count, 0),
        revenue: data.total_revenue ?? rows.reduce((sum, row) => sum + row.revenue, 0),
      },
    };
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${BASE}/${id}`);
  },
};
