import { api } from "@/lib/axios";
import { API_VERSION } from "@/config/env";
import { toFk, unwrapPaginated } from "@/lib/apiMappers";
import type { ApiResponse, PaginatedResponse } from "@/types/api.type";
import type {
  AddUxiolabsProductInput,
  PoolState,
  BulkAddUxiolabsInput,
  BulkAddUxiolabsResult,
  ProviderProduct,
  ProviderProductListParams,
  SetProviderMarginInput,
  UxiolabsPriceListItem,
  UxiolabsPriceListParams,
  UxiolabsSkuPreview,
} from "../types/product.type";

/**
 * The Product Provider tab's data layer — the Uxiolabs price list plus the add
 * paths that turn a SKU into a real Product. Kept separate from
 * `products.service.ts` (the catalog CRUD) so each service owns one concern.
 */
const BASE = `${API_VERSION}/uxiolabs`;
/** The redesigned Product Provider tab reads the managed mapping list. */
const MANAGED_BASE = `${API_VERSION}/supplier-products`;

/** The API row is the view row minus the synthetic `id` the service injects. */
type PriceListApiRow = Omit<UxiolabsPriceListItem, "id">;

/** The `/supplier-products` row shape (SupplierProductResource + product/supplier). */
interface SupplierProductApiRow {
  id: number;
  product_id: number | null;
  buyer_sku_code: string;
  provider_name: string | null;
  price: number;
  is_active: boolean;
  is_price_locked: boolean;
  is_system: boolean;
  buyer_product_status: boolean;
  pool_state: PoolState;
  can_promote: boolean;
  promote_blocked_reason: string | null;
  price_min: number | null;
  price_max: number | null;
  /** The day's selling allowance; null = unlimited. Attached per page by the API. */
  daily_order_limit: number | null;
  stock_left_today: number | null;
  pool_category?: { id: number; name: string } | null;
  /**
   * Projected prices for a pooled row, which has no product to read real ones
   * from — one entry per active membership plan, carrying its label. It used to
   * be a fixed four-tier object under `preview_prices`, which the API stopped
   * emitting when pricing moved to plans; every tier then read 0 here.
   */
  preview_plan_prices?: { membership_plan_id: number; plan_code: string; plan_name: string; is_default: boolean; price: number }[] | null;
  /** The margins an admin authored, keyed by plan — what the form prefills from. */
  plan_margins?: { membership_plan_id: number; margin_percent: number }[] | null;
  point_percent?: number | null;
  point_flat?: number | null;
  margins: { member: number | null; vip: number | null; reseller: number | null; agent: number | null };
  product?: {
    id: number;
    name: string;
    code: string;
    price_modal: number;
    price_member: number;
    price_vip: number;
    price_reseller: number;
    price_agent: number;
    status: boolean;
    category?: { id: number; name: string } | null;
  } | null;
  supplier?: { id: number; name: string; is_system: boolean } | null;
  created_at: string;
}

/** Flatten the nested API row into the view model the managed table renders. */
const toProviderProduct = (row: SupplierProductApiRow): ProviderProduct => {
  const product = row.product;
  const pooled = row.product_id === null;
  const previewByPlan = row.preview_plan_prices ?? [];
  // Legacy four-tier view for the provider table's price cell. The plan order is
  // the admin's own sort order, so the first entry is the default tier.
  const previewFallback = previewByPlan.map((entry) => entry.price);
  return {
    id: String(row.id),
    buyer_sku_code: row.buyer_sku_code,
    cost: row.price,
    is_active: Boolean(row.is_active),
    is_price_locked: Boolean(row.is_price_locked),
    is_system: Boolean(row.is_system),
    is_available: Boolean(row.buyer_product_status),
    pool_state: row.pool_state,
    can_promote: Boolean(row.can_promote),
    promote_blocked_reason: row.promote_blocked_reason ?? null,
    is_price_preview: pooled,
    price_min: row.price_min ?? null,
    price_max: row.price_max ?? null,
    daily_order_limit: row.daily_order_limit ?? null,
    stock_left_today: row.stock_left_today ?? null,
    supplier_name: row.supplier?.name ?? "—",
    // A pooled row has no product, so it falls back to the category it was
    // pooled for and to the provider's own name for the SKU.
    category_name: product?.category?.name ?? row.pool_category?.name ?? "—",
    product_name: product?.name ?? row.provider_name ?? row.buyer_sku_code,
    product_code: product?.code ?? row.buyer_sku_code,
    margins: {
      public: row.margins?.member ?? null,
      vip: row.margins?.vip ?? null,
      reseller: row.margins?.reseller ?? null,
      agent: row.margins?.agent ?? null,
    },
    plan_margins: row.plan_margins ?? [],
    preview_plan_prices: previewByPlan,
    point_percent: row.point_percent ?? null,
    point_flat: row.point_flat ?? null,
    variant: {
      // Prefixed by origin: a product id and a supplier_product id are different
      // counters, and an unprefixed String() lets two rows collide on one React key.
      id: pooled ? `sp-${row.id}` : `p-${product?.id ?? row.id}`,
      name: product?.name ?? row.provider_name ?? row.buyer_sku_code,
      cost_price: product?.price_modal ?? row.price,
      prices: {
        public: pooled ? (previewFallback[0] ?? 0) : (product?.price_member ?? 0),
        vip: pooled ? (previewFallback[1] ?? 0) : (product?.price_vip ?? 0),
        reseller: pooled ? (previewFallback[2] ?? 0) : (product?.price_reseller ?? 0),
        agent: pooled ? (previewFallback[3] ?? 0) : (product?.price_agent ?? 0),
      },
      // A pooled row sells nothing, so it is never "active" whatever the mapping says.
      status: !pooled && product?.status ? "active" : "inactive",
    },
    created_at: row.created_at,
  };
};

/** A membership plan, as the margin form needs to know it. */
export interface MarginPlanOption {
  value: string;
  label: string;
  /** Two plans may share a display name, so the form labels them by code too. */
  code: string;
  is_default: boolean;
}

/** A pricing rule, as the Add Products price preview needs it. */
export interface PricingRuleOption {
  /** null = every category. */
  category_id: number | null;
  /** null = every membership plan (the fallback every unpriced plan uses). */
  membership_plan_id: number | null;
  markup_percent: number;
  markup_flat: number;
}

export const providerService = {
  /**
   * The membership plans a margin can be set for.
   *
   * Fetched here rather than imported from the pricing feature: one feature
   * must never reach into another's service, and this projection is only what
   * the margin form needs.
   */
  planOptions: async (): Promise<MarginPlanOption[]> => {
    const response: ApiResponse<{ data: { id: number; code: string; name?: unknown; is_default?: boolean }[] }> =
      await api.get(`${API_VERSION}/membership-plans`, { params: { per_page: 100 } });

    return response.data.data.map((plan) => {
      const name = plan.name as Record<string, string> | string | null | undefined;
      const label = typeof name === "string" ? name : (name?.id ?? name?.en ?? plan.code);

      return { value: String(plan.id), label, code: plan.code, is_default: Boolean(plan.is_default) };
    });
  },

  /**
   * The markup rules the backend applies when a plan has no margin of its own —
   * `price = ceil(cost × (1 + %/100)) + flat`. Fetched directly for the same
   * reason as `planOptions` (one feature never reaches into another's service);
   * used only to preview the price an empty margin falls back to.
   */
  pricingRules: async (): Promise<PricingRuleOption[]> => {
    const response: ApiResponse<
      { id: number; category_id: number | null; membership_plan_id: number | null; markup_percent: number | string; markup_flat: number | string }[]
    > = await api.get(`${API_VERSION}/pricing-rules`);

    return response.data.map((rule) => ({
      category_id: rule.category_id ?? null,
      membership_plan_id: rule.membership_plan_id ?? null,
      markup_percent: Number(rule.markup_percent),
      markup_flat: Number(rule.markup_flat),
    }));
  },

  priceList: async (params: UxiolabsPriceListParams = {}): Promise<PaginatedResponse<UxiolabsPriceListItem>> => {
    const { only_unmapped, ...rest } = params;
    // The API's `boolean` rule rejects the string "true" (what axios sends for a JS boolean)
    // but accepts "1"/"0". Send 1 (omit when false) so it validates on any API version.
    const query = { ...rest, ...(only_unmapped ? { only_unmapped: 1 } : {}) };
    const response: ApiResponse<PaginatedResponse<PriceListApiRow>> = await api.get(`${BASE}/price-list`, { params: query });
    return unwrapPaginated(response, (row) => ({ ...row, id: row.buyer_sku_code }));
  },

  /** Suggested prices for the add dialog — refetched when the category changes. */
  skuPreview: async (buyerSkuCode: string, categoryId?: string): Promise<UxiolabsSkuPreview> => {
    const response: ApiResponse<UxiolabsSkuPreview> = await api.get(`${BASE}/sku-preview`, {
      params: { buyer_sku_code: buyerSkuCode, ...(categoryId ? { category_id: toFk(categoryId) } : {}) },
    });
    return response.data;
  },

  /** Single add — the admin's four tier prices are sent explicitly. */
  add: async (input: AddUxiolabsProductInput): Promise<void> => {
    await api.post(`${BASE}/products`, {
      buyer_sku_code: input.buyer_sku_code,
      category_id: toFk(input.category_id),
      sub_category_id: input.sub_category_id ? toFk(input.sub_category_id) : null,
      ...(input.name ? { name: input.name } : {}),
      price_member: input.price_member,
      price_vip: input.price_vip,
      price_reseller: input.price_reseller,
      price_agent: input.price_agent,
      status: input.status,
    });
  },

  /** Bulk add — no per-SKU prices; the backend derives them from pricing rules. */
  bulkAdd: async (input: BulkAddUxiolabsInput): Promise<BulkAddUxiolabsResult> => {
    const response: ApiResponse<BulkAddUxiolabsResult> = await api.post(`${BASE}/products/bulk`, {
      category_id: toFk(input.category_id),
      sub_category_id: input.sub_category_id ? toFk(input.sub_category_id) : null,
      status: input.status,
      buyer_sku_codes: input.buyer_sku_codes,
    });
    return response.data;
  },

  // ── Managed provider products (redesigned Product Provider tab) ────────────

  list: async (params: ProviderProductListParams = {}): Promise<PaginatedResponse<ProviderProduct>> => {
    const query = {
      ...(params.search ? { search: params.search } : {}),
      ...(params.supplier_id ? { supplier_id: toFk(params.supplier_id) } : {}),
      ...(params.category_id ? { category_id: toFk(params.category_id) } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.mode ? { mode: params.mode } : {}),
      ...(params.ids ? { ids: params.ids } : {}),
      ...(params.pool_state ? { pool_state: params.pool_state } : {}),
      ...(params.availability ? { availability: params.availability } : {}),
      ...(params.min_cost !== undefined ? { min_cost: params.min_cost } : {}),
      ...(params.max_cost !== undefined ? { max_cost: params.max_cost } : {}),
      page: params.page,
      per_page: params.per_page,
    };
    const response: ApiResponse<PaginatedResponse<SupplierProductApiRow>> = await api.get(MANAGED_BASE, { params: query });
    return unwrapPaginated(response, toProviderProduct);
  },

  lockPrice: async (id: string, locked: boolean): Promise<void> => {
    await api.post(`${MANAGED_BASE}/${id}/lock-price`, { locked });
  },

  setMargin: async (id: string, input: SetProviderMarginInput): Promise<void> => {
    await api.post(`${MANAGED_BASE}/${id}/profit-margin`, input);
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`${MANAGED_BASE}/${id}`);
  },

  // ── Bulk provider actions ──────────────────────────────────────────────────

  bulkLockPrice: async (ids: string[], locked: boolean): Promise<void> => {
    await api.post(`${MANAGED_BASE}/bulk/lock-price`, { ids: ids.map(toFk), locked });
  },

  bulkSetMargin: async (ids: string[], input: SetProviderMarginInput): Promise<void> => {
    await api.post(`${MANAGED_BASE}/bulk/profit-margin`, { ids: ids.map(toFk), ...input });
  },

  bulkRemove: async (ids: string[]): Promise<{ deleted: number; skipped: { id: number; reason: string }[] }> => {
    const response: ApiResponse<{ deleted: number; skipped: { id: number; reason: string }[] }> = await api.post(
      `${MANAGED_BASE}/bulk/delete`,
      { ids: ids.map(toFk) },
    );
    return response.data;
  },
};
