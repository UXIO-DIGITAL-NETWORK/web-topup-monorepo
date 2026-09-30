/**
 * Feature-local entity types (product_requirements.md §6 — global entities go
 * in `src/types/models/`, feature-specific ones stay with their feature).
 * snake_case, matching `Category` and `IntegrationChannel`.
 *
 * **Provisional pending the API contract.** §6 briefs Product as
 * `id, game_id, name, cost_price, selling_price, provider_sku?, is_available`;
 * everything else here is read off the supplied reference and flagged in §4.6.
 */

export type ProductStatus = "active" | "inactive";

/**
 * How a product's own discount is expressed: a percentage of the plan price, or
 * rupiah off it. Mirrors the API's `products.discount_type`.
 */
export const PRODUCT_DISCOUNT_TYPES = ["percent", "fixed"] as const;
export type ProductDiscountType = (typeof PRODUCT_DISCOUNT_TYPES)[number];

/**
 * Where a Main Product sits in its lifecycle — the API's `publish_state`.
 *
 * `status` alone could never answer this. A product is only live when an active
 * supplier mapping backs it, which is why the row menu's old "Activate" could
 * report a product as active that the storefront still could not see.
 *
 * - `draft`       promoted but never published
 * - `published`   live: active AND served by an active supplier mapping
 * - `unpublished` was live, taken down deliberately
 * - `archived`    soft-deleted; kept so its order history keeps resolving
 */
export const PUBLISH_STATES = ["draft", "published", "unpublished", "archived"] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

export const PUBLISH_STATE_LABELS: Record<PublishState, string> = {
  draft: "Draft",
  published: "Published",
  unpublished: "Unpublished",
  archived: "Archived",
};

/**
 * Customer tiers a variant is priced for, in the reference card's order:
 * retail first, then the discounted trade tiers.
 */
export const PRICE_TIERS = ["public", "vip", "reseller", "agent"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

/** One purchasable nominal under a product, e.g. a diamond pack tier. */
export interface ProductVariant {
  id: string;
  name: string;
  /** §6's `cost_price` — upstream cost in IDR, the price card's `Cost` row. */
  cost_price: number;
  /** §6's `selling_price`, per tier. `public` is the retail price. */
  prices: Record<PriceTier, number>;
  status: ProductStatus;
}

export interface Product {
  id: string;
  name: string;
  /** Thumbnail. Absent on every fixture today — the cell falls back to an
   * initials tile, so real URLs drop in later with no code change. */
  image_url?: string;
  /** §6's FK. Kept for the API swap even though nothing resolves it yet. */
  game_id: string;
  /** Denormalized for display: no Game service exists, and the real API will
   * join. Searchable, but no longer a column of its own — the list shows the
   * price breakdown in that slot. */
  game_name: string;
  category_name: string;
  /** §6's `provider_sku`. */
  code: string;

  /* Captured by the Add form (§4.6). All optional — every fixture predates
     them, and the reference marks only name, code and category as required. */
  /** Secondary display name, the form's "Sub Name". */
  sub_name?: string;
  /** Parent `SubCategory`'s name, denormalized like `category_name`. */
  sub_category_name?: string;
  /** Which upstream API validates the buyer's account nickname. */
  nickname_validation?: string;
  /** A `PRODUCT_ACCESS_OPTIONS` value — which customer tier may buy this. */
  access?: string;
  /** A `PRODUCT_TAG_OPTIONS` value — storefront merchandising label. */
  tag?: string;
  /** Storefront copy shown on the product page. */
  description?: string;
  /** Lifecycle. First of the two stacked badges the reference shows. */
  status: ProductStatus;
  /** Derived from `status` AND the supplier mapping — see `PublishState`. */
  publish_state: PublishState;
  /** False when publishing would fail; the row menu disables the item and says why. */
  can_publish: boolean;
  publish_blocked_reason: string | null;
  published_at?: string | null;
  archived_at?: string | null;
  /** §6's `is_available` — storefront visibility. The second badge. */
  is_available: boolean;
  /**
   * Loyalty points this product earns, set on the product form. `null` means
   * the global `points` settings apply — which is not the same as 0, "this
   * product earns nothing".
   */
  point_percent?: number | null;
  point_flat?: number | null;
  /** Selling price per membership plan — what the table renders. Optional, and
   * empty/absent for a product priced before plan pricing existed (the legacy
   * four-tier fixtures included), which falls back to `variants`. */
  plan_prices?: PlanPricePreview[];
  /** Price controls (bulk feature). `0/null = no limit`. */
  is_price_hidden?: boolean;
  price_min?: number | null;
  price_max?: number | null;
  /**
   * A standing price cut that belongs to the product itself — neither a flash
   * sale (time-boxed) nor a promo code (typed at checkout). `null` type means no
   * discount, which is not the same as a value of 0.
   *
   * `discount_value` is a percentage when the type is `percent`, rupiah off when
   * it is `fixed`. The server applies it in `PlanPrice`, so the number shown here
   * is only ever a description of what the API already charges.
   */
  discount_type?: ProductDiscountType | null;
  discount_value?: number | null;
  variants: ProductVariant[];
  created_at: string;
  updated_at: string;
}

/**
 * Publish/unpublish reports per-row skips rather than failing the batch — one
 * SKU the provider switched off must not cost the admin the other forty-nine.
 * Same shape the pool's bulk publish already returns.
 */
export interface BulkPublishResult {
  updated: number;
  skipped: { id: number; code: string; reason: string }[];
}

export interface ProductListParams {
  search?: string;
  /** Lifecycle filter. Omitted = everything except archived. */
  publish_state?: PublishState;
  /** A real `categories.id`. Was the category *name*, matched through `search`,
   * which could only ever hit a product whose own name contained it. */
  category_id?: string;
  /** A `PRICE_RANGE_OPTIONS` value — the toolbar's "All Price". */
  price?: string;
  page?: number;
  per_page?: number;
}

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * The same option before its label is resolved.
 *
 * Option lists are module constants, so they carry a key rather than a
 * sentence — a constant would otherwise freeze whichever language happened to
 * be loaded at import and never update.
 */
export interface KeyedSelectOption {
  value: string;
  labelKey: string;
}

/** A category the toolbar filters by and the Add form assigns. It carries the
 * game so a product created from the form still gets the denormalized
 * `game_id`/`game_name` the entity needs — the real API will join instead. */
export interface CategoryOption extends SelectOption {
  game_id: string;
  game_name: string;
}

/** A price bucket. `max` is exclusive; omitting it means "and above". */
export interface PriceRangeOption extends KeyedSelectOption {
  min: number;
  max?: number;
}

/* ── Product Provider tab — Uxiolabs price list ──────────────────────────── */

/**
 * One row of the Uxiolabs price list (`GET /v1/uxiolabs/price-list`).
 * Uxiolabs is prepaid-only, so there is no `type` dimension anymore. `id` is
 * the `buyer_sku_code` (the uxiolabs service id) — the SKU is the natural key,
 * and `DataTable<TData extends {id: string}>` needs a string id.
 */
export interface UxiolabsPriceListItem {
  id: string;
  buyer_sku_code: string;
  name: string;
  category: string;
  /** Supplier cost in IDR at the configured price tier. */
  cost: number;
  /** The four uxiolabs tier prices, as published. */
  harga: number;
  harga_gold: number;
  harga_silver: number;
  harga_pro: number;
  /** Uxiolabs `status === "aktif"`. */
  available: boolean;
  /** Already mapped to one of our products (SupplierProduct exists). */
  already_mapped: boolean;
}

export interface UxiolabsPriceListParams {
  search?: string;
  only_unmapped?: boolean;
  page?: number;
  per_page?: number;
}

/** Suggested selling prices from the backend's SKU preview (pricing rules). */
export interface UxiolabsSuggestedPrices {
  price_modal: number;
  price_member: number;
  price_vip: number;
  price_reseller: number;
  price_agent: number;
}

export interface UxiolabsSkuPreview {
  buyer_sku_code: string;
  name: string;
  cost: number;
  already_mapped: boolean;
  suggested_prices: UxiolabsSuggestedPrices;
}

/** Single add: the admin picks a category and confirms the four tier prices. */
export interface AddUxiolabsProductInput {
  buyer_sku_code: string;
  category_id: string;
  sub_category_id?: string | null;
  name?: string;
  price_member: number;
  price_vip: number;
  price_reseller: number;
  price_agent: number;
  status: boolean;
}

/** Bulk add: one shared category, prices derived server-side per SKU. */
export interface BulkAddUxiolabsInput {
  category_id: string;
  sub_category_id?: string | null;
  status: boolean;
  buyer_sku_codes: string[];
}

export interface BulkAddUxiolabsResult {
  created: number;
  skipped: { buyer_sku_code: string; reason: string }[];
}

/* ── Product Provider tab — managed provider products ──────────────────────── */

/**
 * A managed provider product: a `SupplierProduct` mapping joined to its Product
 * and Supplier (`GET /v1/supplier-products`). This is the row the redesigned
 * Product Provider table lists — with the product's price breakdown, its
 * supplier, and the flags bulk/row actions act on. `is_system` rows come from
 * the Internal System supplier and are protected (not selectable, no delete).
 */
/**
 * Where a mapping sits in the provider pipeline. Mirrors the API's own
 * `SupplierProduct::poolState()` — never re-derive it here, or a badge and the
 * promote guard will eventually disagree.
 *
 * - `needs_margin` pooled, no price decided yet
 * - `ready`        pooled and priced, promotable
 * - `draft`        promoted to a product that has never been published
 * - `published`    live on the storefront
 */
export const POOL_STATES = ["needs_margin", "ready", "draft", "published"] as const;
export type PoolState = (typeof POOL_STATES)[number];

export const POOL_STATE_LABELS: Record<PoolState, string> = {
  needs_margin: "Needs margin",
  ready: "Ready",
  draft: "Draft",
  published: "Published",
};

export interface PlanMargin {
  membership_plan_id: number;
  margin_percent: number;
}

export interface PlanPricePreview {
  membership_plan_id: number;
  plan_code: string;
  plan_name: string;
  is_default: boolean;
  price: number;
}

export interface ProviderProduct {
  id: string;
  buyer_sku_code: string;
  /** Supplier cost in IDR (the price card's Cost row). */
  cost: number;
  is_active: boolean;
  is_price_locked: boolean;
  is_system: boolean;
  supplier_name: string;
  category_name: string;
  product_name: string;
  product_code: string;
  /** Pipeline stage, and the promote gate as the server decides it. */
  pool_state: PoolState;
  can_promote: boolean;
  promote_blocked_reason: string | null;
  /** True while the row is still pooled — its prices are a projection, not stored. */
  is_price_preview: boolean;
  /** Whether the SKU is still active upstream. */
  is_available: boolean;
  /** Selling-price window carried onto the product at promote. 0/null = no limit. */
  price_min: number | null;
  price_max: number | null;
  /**
   * The day's selling allowance for this SKU — a LOCAL quota, since the provider
   * reports no quantity at all. null = no ceiling.
   */
  daily_order_limit: number | null;
  /** Slots left today (null = no ceiling, 0 = nothing left). */
  stock_left_today: number | null;
  /** Per-tier margin overrides in percent; null = derived from pricing rules.
   * Legacy four-tier view, kept for the provider table. */
  margins: Record<PriceTier, number | null>;
  /** The margins an admin authored, keyed by membership plan — what the Set
   * Profit Margin form prefills from. The number of tiers is data, so this is
   * the shape that can describe a plan created this morning. */
  plan_margins: PlanMargin[];
  /** Projected selling price per plan for a pooled row. Empty once promoted:
   * the product then carries real stored prices. */
  preview_plan_prices: PlanPricePreview[];
  /** Loyalty points earned on this SKU. `null` = use the global points
   * settings, `0` = this SKU earns nothing. */
  point_percent: number | null;
  point_flat: number | null;
  /** The product's price breakdown, ready for `ProductPriceCell`. */
  variant: ProductVariant;
  created_at: string;
}

export interface ProviderProductListParams {
  search?: string;
  supplier_id?: string;
  category_id?: string;
  /** "active" | "inactive" | undefined (all). */
  status?: string;
  /** "auto" | "manual" | undefined — locked mappings are "manual". */
  mode?: string;
  /** Comma-joined ids, so the margin page can address an exact selection. */
  ids?: string;
  /** One of PoolState, or undefined for all. */
  pool_state?: string;
  /** "available" | "unavailable" | undefined — upstream availability. */
  availability?: string;
  min_cost?: number;
  max_cost?: number;
  page?: number;
  per_page?: number;
}

/**
 * What the Main Products form sends to `POST /products/{id}/profit-margin`.
 *
 * Deliberately the same shape as `SetProviderMarginInput`: the API delegates to
 * the provider mapping's action wherever one exists, so the two screens author
 * the same rows and cannot disagree about what a margin means.
 */
export interface SetProductMarginInput {
  margins?: Record<number, number | null>;
  price_min?: number | null;
  price_max?: number | null;
  point_percent?: number | null;
  point_flat?: number | null;
}

/** Per-tier profit-margin percentages sent to `POST …/profit-margin`. */
export interface SetProviderMarginInput {
  /**
   * Margins keyed by membership plan id. A plan present with `null` is an
   * explicit "use the pricing rules"; a plan omitted entirely is left as it
   * was, so clearing one tier does not clear the rest.
   *
   * The number of tiers is data — this replaced four fixed `margin_*` fields
   * that could not describe a plan the admin had just created.
   */
  margins?: Record<number, number | null>;
  /** Sent only when the form actually carries the limit fields — omitting them
   * leaves an existing window alone rather than clearing it. */
  price_min?: number | null;
  price_max?: number | null;
  /** Loyalty points earned on this SKU. Sent only when the form carries the
   * fields; null clears the override back to the global points settings, while
   * 0 means the SKU earns nothing. */
  point_percent?: number | null;
  point_flat?: number | null;
  /**
   * The day's selling allowance for this SKU. Sent only when the form carries
   * the field; null clears the ceiling back to unlimited, and 0 is a legitimate
   * "not today".
   */
  daily_order_limit?: number | null;
}

/* ── Provider pool ─────────────────────────────────────────────────────────── */

/** One provider SKU offered by the Add panel, already filtered to a configured
 * Category Provider. */
export interface PoolCandidate {
  id: string;
  buyer_sku_code: string;
  name: string;
  /** The provider's own category string. */
  provider_category: string;
  /** Our category, resolved through the Category Provider mapping. */
  mapped_category_name: string | null;
  cost: number;
  available: boolean;
  already_pooled: boolean;
  already_promoted: boolean;
  is_new: boolean;
}

export type PoolSort = "name_asc" | "name_desc" | "cost_asc" | "cost_desc";

export interface PoolCandidateListParams {
  search?: string;
  provider_category?: string;
  category_id?: string;
  /** "new" (default) | "not_pooled" | "all". */
  pool_state?: string;
  /** "available" (default) | "unavailable" | "all". */
  availability?: string;
  /** Supplier cost bounds in whole rupiah, both inclusive. */
  cost_min?: number;
  cost_max?: number;
  /** Omitted leaves the provider's own feed order. */
  sort?: PoolSort;
  page?: number;
  per_page?: number;
}

/**
 * What there is to filter on, from the API.
 *
 * The page cannot derive any of it: which provider categories exist depends on
 * what has been mapped under Category Provider, and the cost bounds move every
 * time the price checker runs. Counts and bounds describe the whole candidate
 * universe, not the current filters — options that vanish as they are used turn
 * a filter bar into a maze.
 */
export interface PoolFacets {
  provider_categories: {
    provider_category: string;
    mapped_category_name: string | null;
    count: number;
  }[];
  categories: { id: number; name: string | null; count: number }[];
  cost: { min: number; max: number };
}

export interface PoolSummary {
  configured_categories: number;
  total_candidates: number;
  pooled_count: number;
  new_count: number;
}

export interface PoolResult {
  pooled: number;
  skipped: { buyer_sku_code: string; reason: string }[];
}

export interface PromoteResult {
  promoted: number;
  skipped: { id: number; buyer_sku_code: string; reason: string }[];
}

export interface PublishResult {
  published: number;
  skipped: { id: number; buyer_sku_code: string; reason: string }[];
}

/**
 * The onboarding shortcut. `promoted` can exceed `published`: a SKU the provider
 * has switched off still becomes a draft product, it just does not go on sale —
 * which is worth reporting rather than rolling back.
 */
export interface PromotePublishResult {
  promoted: number;
  published: number;
  skipped: { id: number; buyer_sku_code: string; reason: string }[];
}

/* ── Add Product (Bulk) ─────────────────────────────────────────────────────── */

/** One row to create in the Add Product Bulk flow. */
export interface BulkCreateProductItem {
  code: string;
  name: string;
  cost: number;
  sub_category_id?: string | null;
}

export interface BulkCreateProductsInput {
  supplier_id: string;
  category_id: string;
  items: BulkCreateProductItem[];
}

export interface BulkCreateProductsResult {
  created: number;
  skipped: { code: string; reason: string }[];
}

/**
 * Add Products ▸ From Supplier. Whatever is picked becomes a DRAFT product
 * immediately — the pool stage this replaced is gone — so the count is of
 * products created, not rows staged.
 */
export interface AddProductsFromSupplierResult {
  created: number;
  skipped: { buyer_sku_code: string; reason: string }[];
}

/* ── Price Change Log ───────────────────────────────────────────────────────── */

/**
 * What the 5-minute checker did to a mapping. `applied` is the routine auto-reprice;
 * `unchanged` is the cost moving without the price following it; `deactivated` and
 * `negative_margin` are the rows an admin has to act on. `locked` is history only —
 * the price lock that produced those rows is gone, so the filter finds old ones and
 * the checker can never add another.
 */
export const PRICE_CHANGE_STATUSES = ["applied", "unchanged", "locked", "deactivated", "negative_margin"] as const;
export type PriceChangeStatus = (typeof PRICE_CHANGE_STATUSES)[number];

export const PRICE_CHANGE_STATUS_LABELS: Record<PriceChangeStatus, string> = {
  applied: "Repriced",
  unchanged: "Unchanged",
  locked: "Locked",
  deactivated: "Deactivated",
  negative_margin: "Negative margin",
};

/** Old → new pair for one price field; `new` is null for events that don't reprice. */
export interface PriceChangePair {
  old: number | null;
  new: number | null;
}

export interface PriceChangeLog {
  id: string;
  supplier_product_id: number;
  product_id: number | null;
  buyer_sku_code: string;
  product_name: string;
  status: PriceChangeStatus;
  needs_attention: boolean;
  reason: string | null;
  old_cost: number;
  new_cost: number;
  prices: Record<"member" | "vip" | "reseller" | "agent", PriceChangePair>;
  created_at: string;
}

export interface PriceChangeLogListParams {
  /** A PriceChangeStatus, or "all". */
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}
