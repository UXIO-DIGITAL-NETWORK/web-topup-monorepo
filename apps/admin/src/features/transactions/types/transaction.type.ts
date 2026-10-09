/**
 * Transaction entity per product_requirements.md §4.3/§6 (revised 2026-07-10
 * against the Automatic Transaction History reference). Provisional until
 * the real API contract lands.
 */
export type TransactionStatus = "pending" | "processing" | "success" | "failed" | "refunded" | "partial_success";

/**
 * The Payment Gateway half — did the customer pay?
 *
 * Deliberately narrower than TransactionStatus: a payment is never "processing"
 * and never "partial". Sharing the wider union is what let the Payment Status
 * dropdown offer states a payment can never be in.
 *
 * `none` is not a gateway state — it means the order never went through a
 * gateway at all (admin-created or manually recorded), which is a real and
 * otherwise invisible answer on the Manual tab.
 */
export type PaymentStatus = "pending" | "success" | "expired" | "refunded" | "none";

/**
 * The Topup Provider half — did the supplier deliver?
 *
 * Three of these name situations the single status column flattened:
 * `rejected` (the supplier said no) versus `undelivered` (our retries ran out
 * with no verdict — worth retrying by hand), and `unconfirmed` (the supplier
 * has the order but we hold no id for it, so nothing can poll it).
 */
export type ProviderStatus =
  | "not_ordered"
  | "queued"
  | "sending"
  | "ordered"
  | "unconfirmed"
  | "delivered"
  | "rejected"
  | "undelivered";

export interface TransactionCustomer {
  user_id: number | null;
  name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
}

export interface TransactionGameRef {
  id: string;
  name: string;
}

export interface TransactionProductRef {
  id: string;
  name: string;
}

/** Human operator who performed an entry. No avatar_url — fixtures carry no
 *  images and AvatarFallback covers it (same as TransactionCustomer today). */
export interface ActivityLogActor {
  name: string;
  phone?: string;
}

/**
 * One audit-trail row for the Activity Log modal (product_requirements.md
 * §4.3/§6). `actor` is the literal "system" for automated events. `action` is
 * a short event label ("Status Changed"); `description` is that event's
 * specific detail ("Status changed from Processing to Success.").
 */
export interface ActivityLogEntry {
  id: string;
  actor: ActivityLogActor | "system";
  action: string;
  description: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  invoice_no: string;
  /** Sub-code shown under the invoice number in the reference. */
  invoice_ref?: string;
  /** The gateway's own verdict, independent of the supplier's. */
  payment_status: PaymentStatus;
  /** The supplier's own verdict, independent of the gateway's. */
  provider_status: ProviderStatus;
  /** The combined order lifecycle. Still what the edit form and the API filter on. */
  invoice_status: TransactionStatus;
  customer: TransactionCustomer;
  game: TransactionGameRef;
  product: TransactionProductRef;
  cost: number;
  profit?: number;
  admin_fee?: number;
  /** Provider/destination account reference. */
  target_ref?: string;
  /** In-game username resolved by the "Cek Username" check at checkout. */
  nickname?: string;
  payment_method: string;
  serial_number?: string;
  proof_url?: string;
  created_at: string;
  resolved_at?: string;
  /** Raw seconds between created_at and resolved_at — UI formats the duration badge. */
  elapsed_seconds?: number;
  /** Audit trail shown by the Activity Log modal. */
  activity_log: ActivityLogEntry[];
  updated_at: string;
}

/** The gateway half of a detail read. Every field is absent until the customer pays. */
export interface TransactionDetailPayment {
  reference_id?: string;
  pg_transaction_id?: string;
  gross_amount?: number;
  paid_at?: string;
}

export interface TransactionDetailSupplier {
  name?: string;
  trx_id?: string;
  /** The provider's own vocabulary, not a TransactionStatus — render it as text. */
  status?: string;
  /**
   * One entry per supplier order. Empty for anything older than the mix
   * feature; one entry for an ordinary product; several for a mix, which is
   * the only way the dialog can show that an order arrived in parts.
   */
  orders?: TransactionSupplierPart[];
}

/** One delivered part of an order: its component, its verdict, its serial. */
export interface TransactionSupplierPart {
  id?: string;
  code?: string;
  name?: string;
  /** The normalized provider verdict — what the status badge renders. */
  provider_status?: ProviderStatus;
  /** The provider's own raw wording, kept as evidence. */
  status?: string;
  sn?: string;
  /** The supplier this part was ordered from. */
  supplier?: string;
  /** Our own reference for this sub-order — the callback value. */
  idtrx?: string;
  attempts?: number;
  last_error?: string;
  created_at?: string;
  updated_at?: string;
  /** Who last re-hit this part with the supplier, and when. */
  retried_by?: string;
  retried_at?: string;
}

/**
 * What `GET /v1/transactions/{id}` guarantees, for the read-only detail
 * dialog.
 *
 * Deliberately NOT a widening of `Transaction`: that type is the DataTable row
 * and the fixture shape, so adding these as required fields would force every
 * fixture to invent gateway references, and adding them as optional would give
 * the dialog no type-level guarantee the data was ever requested — the exact
 * mechanism that left the Game column blank.
 *
 * `total_price` is excluded on purpose: the API writes it only for
 * admin-created rows, so it is 0 on every customer order.
 * `resolved_at`/`elapsed_seconds` are excluded too — both are derived from
 * `updated_at`, so a later admin edit silently rewrites them. The dialog shows
 * `updated_at` honestly as "Last Update" instead.
 */
export interface TransactionDetail {
  id: string;
  invoice_no: string;
  invoice_status: TransactionStatus;
  payment_status: PaymentStatus;
  provider_status: ProviderStatus;
  is_manual: boolean;
  customer: TransactionCustomer;
  game: TransactionGameRef;
  product: TransactionProductRef;
  target_ref?: string;
  target_uid?: string;
  target_server?: string;
  nickname?: string;
  serial_number?: string;
  proof_url?: string;
  /** Already net of `discount_amount` — the discount is informational only. */
  amount_base: number;
  discount_amount: number;
  amount_fee: number;
  /** Equal to `amount_fee` on every modern row; only legacy markup rows differ. */
  channel_fee: number;
  amount_total: number;
  margin: number;
  payment_method: string;
  payment: TransactionDetailPayment;
  supplier: TransactionDetailSupplier;
  created_at: string;
  updated_at: string;
}

/** The 10 filter-bar fields from product_requirements.md §4.3, plus pagination + sorting. */
export interface TransactionListParams {
  search?: string;
  userId?: string;
  categoryId?: string;
  productId?: string;
  invoiceStatus?: TransactionStatus;
  paymentStatus?: PaymentStatus;
  providerStatus?: ProviderStatus;
  startDate?: string;
  endDate?: string;
  invoiceFrom?: string;
  paymentMethod?: string;
  page?: number;
  per_page?: number;
  /** Column id from the table (e.g. "invoice_no", "cost", "time") — see SORTERS in transactions.service.ts. */
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

/**
 * The three clickable status pills above the table.
 *
 * These were originally `pending / partial_refund / partial_success`, but
 * neither partial state exists in the backend's transaction status enum —
 * there is no data behind them and never was. The pills now surface the three
 * statuses an operator actually acts on, which is what the API's
 * `/transactions/status-counts` reports.
 */
export interface StatusCounts {
  pending: number;
  processing: number;
  failed: number;
  /** Per-lifecycle breakdowns. Optional — absent when running against an API that predates the split. */
  provider?: Partial<Record<ProviderStatus, number>>;
  payment?: Partial<Record<PaymentStatus, number>>;
}

/** Small typed option shape for the filter-bar selects. */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The same option before its label is resolved. Option lists are module
 * constants, so they carry a key rather than a sentence — a constant would
 * otherwise freeze whichever language was loaded at import.
 */
export interface KeyedSelectOption {
  value: string;
  labelKey: string;
}

/** Recap report granularity (product_requirements.md §4.3). */
export type RecapPeriod = "daily" | "monthly";

/** One breakdown line of the recap — per game/product/payment channel. */
export interface RecapRow {
  label: string;
  count: number;
  revenue: number;
}

/** Downloadable daily/monthly transaction recap with a totals footer. */
export interface TransactionRecap {
  period: RecapPeriod;
  generated_at: string;
  rows: RecapRow[];
  totals: { count: number; revenue: number };
}
