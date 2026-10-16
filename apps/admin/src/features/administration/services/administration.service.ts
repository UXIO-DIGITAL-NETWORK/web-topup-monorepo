import { api } from "@/lib/axios";
import { API_VERSION } from "@/config/env";
import { toRowId, unwrapPaginated } from "@/lib/apiMappers";
import type { ApiResponse, PaginatedResponse } from "@/types/api.type";
import type {
  AdminUser,
  AdministrationListParams,
  BalanceAdjustmentInput,
  BalanceMutationRow,
  PaymentChannel,
  PointLedgerRow,
  Setting,
  UserOverview,
  UserRefundRow,
  UserStatus,
} from "../types/administration.type";

interface PaymentChannelApiRow {
  id: number;
  payment_type: string;
  channel_code: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  min_amount: number;
  fee_flat: number;
  fee_percent: number;
  sort_order: number;
  is_active: boolean;
  is_single_use: boolean;
  created_at: string;
  updated_at: string;
}

interface UserApiRow {
  id: number;
  role_id: number;
  role?: { name: string } | string | null;
  name: string;
  username: string | null;
  email: string;
  phone: string;
  avatar_url: string | null;
  balance: number;
  point: number;
  locale: string;
  status?: string | null;
  email_verified_at: string | null;
  created_at: string;
}

interface SettingApiRow {
  id: number;
  group: string;
  key: string;
  value: string | null;
  /** Public URL for an image setting — `value` is only a storage path. */
  value_url?: string | null;
  type: Setting["type"];
  label: string | null;
  is_public: boolean;
}

const toChannel = (row: PaymentChannelApiRow): PaymentChannel => ({
  id: toRowId(row.id),
  payment_type: row.payment_type,
  channel_code: row.channel_code,
  name: row.name,
  logo_url: row.logo_url ?? undefined,
  description: row.description ?? undefined,
  min_amount: row.min_amount,
  fee_flat: row.fee_flat,
  fee_percent: row.fee_percent,
  sort_order: row.sort_order,
  is_active: Boolean(row.is_active),
  is_single_use: Boolean(row.is_single_use),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toUser = (row: UserApiRow): AdminUser => ({
  id: toRowId(row.id),
  role_id: toRowId(row.role_id),
  // The API sends `role` as a string on some projections and a relation object
  // on others; normalise so the column never has to know which.
  role: typeof row.role === "string" ? row.role : (row.role?.name ?? undefined),
  name: row.name,
  username: row.username ?? undefined,
  email: row.email,
  phone: row.phone,
  avatar_url: row.avatar_url ?? undefined,
  balance: row.balance,
  point: row.point,
  locale: row.locale,
  // The API omits `status` on projections that predate the field; an existing
  // member with no explicit standing is active.
  status: (row.status as UserStatus | undefined) ?? "active",
  email_verified_at: row.email_verified_at ?? undefined,
  created_at: row.created_at,
});

interface UserOverviewApiRow {
  user: UserApiRow;
  stats: UserOverview["stats"];
  membership: UserOverview["membership"];
}

interface BalanceMutationApiRow {
  id: number;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference: string | null;
  description: string | null;
  created_at: string;
}

interface PointLedgerApiRow {
  id: number;
  type: string;
  amount: number;
  points_before: number;
  points_after: number;
  reference: string | null;
  description: string | null;
  created_at: string;
}

interface UserRefundApiRow {
  id: number;
  refund_number: string;
  invoice_number: string | null;
  amount: number;
  status: string;
  method: string;
  created_at: string;
  refunded_at: string | null;
}

const toOverview = (row: UserOverviewApiRow): UserOverview => ({
  user: toUser(row.user),
  stats: row.stats,
  membership: row.membership,
});

// Ids arrive numeric and every table/column is string-typed — see `toRowId`.
const toBalanceMutation = (row: BalanceMutationApiRow): BalanceMutationRow => ({ ...row, id: toRowId(row.id) });
const toPointLedger = (row: PointLedgerApiRow): PointLedgerRow => ({ ...row, id: toRowId(row.id) });
const toUserRefund = (row: UserRefundApiRow): UserRefundRow => ({ ...row, id: toRowId(row.id) });

const toSetting = (row: SettingApiRow): Setting => ({
  id: toRowId(row.id),
  group: row.group,
  key: row.key,
  value: row.value,
  value_url: row.value_url ?? undefined,
  type: row.type,
  label: row.label ?? undefined,
  is_public: Boolean(row.is_public),
});

export type PaymentChannelInput = Omit<PaymentChannel, "id" | "logo_url" | "created_at" | "updated_at"> & {
  logo?: File | null;
};

export const paymentChannelsService = {
  list: async (params: AdministrationListParams = {}): Promise<PaginatedResponse<PaymentChannel>> => {
    const response: ApiResponse<PaginatedResponse<PaymentChannelApiRow>> = await api.get(
      `${API_VERSION}/payment-channels`,
      { params },
    );
    return unwrapPaginated(response, toChannel);
  },
  getById: async (id: string): Promise<PaymentChannel> => {
    const response: ApiResponse<PaymentChannelApiRow> = await api.get(`${API_VERSION}/payment-channels/${id}`);
    return toChannel(response.data);
  },
  update: async (id: string, input: Partial<PaymentChannelInput>): Promise<PaymentChannel> => {
    const form = new FormData();
    form.append("_method", "PUT");
    for (const [key, value] of Object.entries(input)) {
      if (key === "logo" || value === undefined || value === null) continue;
      form.append(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
    }
    if (input.logo instanceof File) form.append("logo", input.logo);

    const response: ApiResponse<PaymentChannelApiRow> = await api.post(`${API_VERSION}/payment-channels/${id}`, form);
    return toChannel(response.data);
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`${API_VERSION}/payment-channels/${id}`);
  },
};

export const usersService = {
  list: async (params: AdministrationListParams = {}): Promise<PaginatedResponse<AdminUser>> => {
    const response: ApiResponse<PaginatedResponse<UserApiRow>> = await api.get(`${API_VERSION}/users`, { params });
    return unwrapPaginated(response, toUser);
  },
  getById: async (id: string): Promise<AdminUser> => {
    const response: ApiResponse<UserApiRow> = await api.get(`${API_VERSION}/users/${id}`);
    return toUser(response.data);
  },
  /** Aggregates + membership for the detail page's summary. */
  overview: async (id: string): Promise<UserOverview> => {
    const response: ApiResponse<UserOverviewApiRow> = await api.get(`${API_VERSION}/users/${id}/overview`);
    return toOverview(response.data);
  },
  balanceMutations: async (
    id: string,
    params: AdministrationListParams = {},
  ): Promise<PaginatedResponse<BalanceMutationRow>> => {
    const response: ApiResponse<BalanceMutationApiRow[]> = await api.get(
      `${API_VERSION}/users/${id}/balance-mutations`,
      { params },
    );
    return unwrapPaginated(response, toBalanceMutation);
  },
  pointHistory: async (
    id: string,
    params: AdministrationListParams = {},
  ): Promise<PaginatedResponse<PointLedgerRow>> => {
    const response: ApiResponse<PointLedgerApiRow[]> = await api.get(`${API_VERSION}/users/${id}/point-history`, {
      params,
    });
    return unwrapPaginated(response, toPointLedger);
  },
  refunds: async (id: string, params: AdministrationListParams = {}): Promise<PaginatedResponse<UserRefundRow>> => {
    const response: ApiResponse<UserRefundApiRow[]> = await api.get(`${API_VERSION}/users/${id}/refunds`, { params });
    return unwrapPaginated(response, toUserRefund);
  },
  /**
   * Manual wallet credit/debit — a money-moving action, so a reason is required
   * and the write goes to a dedicated audited endpoint rather than a plain PUT.
   */
  adjustBalance: async (id: string, input: BalanceAdjustmentInput): Promise<AdminUser> => {
    if (!input.reason.trim()) throw new Error("A reason is required");
    const response: ApiResponse<UserApiRow> = await api.post(`${API_VERSION}/users/${id}/balance-adjustments`, {
      amount: input.amount,
      direction: input.direction,
      reason: input.reason,
    });
    return toUser(response.data);
  },
  setStatus: async (id: string, status: UserStatus): Promise<AdminUser> => {
    const response: ApiResponse<UserApiRow> = await api.post(`${API_VERSION}/users/${id}/status`, { status });
    return toUser(response.data);
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`${API_VERSION}/users/${id}`);
  },
};

export const settingsService = {
  /** Not paginated — settings are edited as one grouped form. */
  list: async (group?: string): Promise<Setting[]> => {
    const response: ApiResponse<SettingApiRow[]> = await api.get(`${API_VERSION}/settings`, { params: { group } });
    return response.data.map(toSetting);
  },
  /** Bulk upsert of `{key: value}`; unknown keys are ignored server-side. */
  update: async (values: Record<string, string | number | boolean>): Promise<Setting[]> => {
    const response: ApiResponse<SettingApiRow[]> = await api.put(`${API_VERSION}/settings`, { settings: values });
    return response.data.map(toSetting);
  },
  /**
   * Image settings have their own write path: the bulk update takes a
   * `{key: value}` map and cannot carry a file, and the endpoint replaces the
   * stored file (deleting the previous one) rather than setting a string.
   */
  upload: async (key: string, file: File): Promise<Setting> => {
    const form = new FormData();
    form.append("key", key);
    form.append("file", file);

    const response: ApiResponse<SettingApiRow> = await api.post(`${API_VERSION}/settings/upload`, form);
    return toSetting(response.data);
  },
};
