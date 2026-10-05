import { vi } from "vitest";

import { ACTIVITY_LOG } from "@/features/dashboard/data/activity-log.data";
import { CHART_SERIES } from "@/features/dashboard/data/chart-series.data";
import { PENDING_ORDERS } from "@/features/dashboard/data/pending-orders.data";
import { PERFORMANCE_ROWS } from "@/features/dashboard/data/performance-rows.data";
import { STAT_CARDS } from "@/features/dashboard/data/stat-cards.data";
import { CHANNELS } from "@/features/integration/data/channels.data";
import { PAYMENT_GATEWAYS } from "@/features/financial/data/payment-gateways.data";
import i18n from "@/config/i18n";
import { summaryCardsFor } from "@/features/financial/data/summary-cards.data";
import { SUPPLIERS } from "@/features/financial/data/suppliers.data";
import { CATEGORIES } from "./fixtures/categories.data";
import { CATEGORY_PROVIDERS } from "./fixtures/category-providers.data";
import { CATEGORY_SERVERS } from "./fixtures/category-servers.data";
import { CATEGORY_TYPES } from "./fixtures/category-types.data";
import { PRODUCTS } from "./fixtures/products.data";
import { TRANSACTIONS } from "@/features/transactions/data/transactions.data";
import { SUB_CATEGORIES } from "./fixtures/sub-categories.data";

/**
 * A fake backend for **page** tests.
 *
 * Service tests mock `api` per case and assert on the exact request. Page tests
 * are about rendered behaviour — a row menu, a confirm dialog, a pagination
 * footer — and still need plausible rows to render. Before the API swap that
 * came from the services' own in-memory fixtures; now the services are real,
 * so the seam moved down to axios and this stands in for the server.
 *
 * Rows are stored in the API's snake_case shape and served through the same
 * envelope the real endpoints use, so the services' mappers run for real in
 * page tests too — a mapper regression fails here rather than silently
 * rendering blanks.
 */

type Row = Record<string, unknown>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Fixtures are written in the admin's view shape; invert them to API rows. */
const toApiCategory = (row: (typeof CATEGORIES)[number], index: number): Row => ({
  id: Number(index + 1),
  type_id: 1,
  name: row.name,
  sub_name: row.sub_name ?? null,
  code: row.code,
  slug: row.slug,
  uid_parser: row.uid_parser,
  validasi_nickname: row.account_nickname_validation ?? null,
  region: row.region ?? null,
  logo_url: row.logo_url ?? null,
  thumbnail_url: null,
  banner_url: null,
  description: row.description ?? null,
  status: row.status === "active",
  order_form_fields: { fields: row.order_form_fields ?? [], customer_no_template: "{user_id}" },
  meta_title: row.meta_title ?? null,
  meta_description: row.meta_description ?? null,
  og_image_url: row.og_image_url ?? null,
  meta_keywords: row.meta_keywords ?? [],
  meta_robots: row.meta_robots ?? null,
  type: { id: 1, name: row.type },
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toApiSubCategory = (row: (typeof SUB_CATEGORIES)[number], index: number): Row => ({
  id: index + 1,
  category_id: Number(row.category_id.replace(/\D/g, "")) || 1,
  name: row.name,
  currency_name: row.currency_name,
  description: row.description ?? null,
  logo: null,
  logo_url: row.logo_url ?? null,
  status: row.status === "active",
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toApiCategoryType = (row: (typeof CATEGORY_TYPES)[number], index: number): Row => ({
  id: index + 1,
  name: row.name,
  is_voucher: row.is_voucher,
  status: row.status === "active",
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toApiServerCategory = (row: (typeof CATEGORY_SERVERS)[number], index: number): Row => ({
  id: index + 1,
  category_id: 1,
  name: row.name,
  options: row.options.map((option, optionIndex) => ({
    id: index * 100 + optionIndex,
    server_category_id: index + 1,
    name: option.name,
    value: option.value,
  })),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const toApiSupplierCategory = (row: (typeof CATEGORY_PROVIDERS)[number], index: number): Row => ({
  id: index + 1,
  category_id: Number(row.category_id.replace(/\D/g, "")) || 1,
  supplier_id: index + 1,
  provider_category: row.provider_category,
  supplier: { id: index + 1, name: row.provider_name },
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/**
 * The product fixtures name their game ("Mobile Legends: Bang Bang") while the
 * category fixtures name the category ("Mobile Legends"), so the two cannot be
 * matched on the string. Mapped explicitly, in the categories fixture's own
 * order — its ids are assigned by index, so this is the id.
 */
const CATEGORY_ID_BY_GAME: Record<string, number> = {
  "Mobile Legends: Bang Bang": 1,
  "Free Fire": 2,
  "Genshin Impact": 3,
  "PUBG Mobile": 4,
  "Valorant": 5,
  "Honkai: Star Rail": 7,
};

const toApiProduct = (row: (typeof PRODUCTS)[number], index: number): Row => {
  const variant = row.variants[0];
  // Every product used to be category_id 1, which made a category filter either
  // return everything or nothing — the filter could not be tested at all.
  const categoryId = CATEGORY_ID_BY_GAME[row.game_name] ?? 1;
  return {
    id: index + 1,
    category_id: categoryId,
    sub_category_id: 1,
    name: row.name,
    sub_name: row.sub_name ?? null,
    code: row.code,
    logo_url: row.image_url ?? null,
    description: row.description ?? null,
    validasi_nickname: row.nickname_validation ?? null,
    access: row.access ?? null,
    tag: row.tag ?? null,
    price_modal: variant?.cost_price ?? 0,
    price_member: variant?.prices.public ?? 0,
    // The API stopped serialising the frozen tier columns when pricing moved to
    // membership plans; `prices` is the shape the table renders from now. Both
    // are kept here so the mapper's legacy fallback stays exercised.
    price_vip: variant?.prices.vip ?? 0,
    price_reseller: variant?.prices.reseller ?? 0,
    price_agent: variant?.prices.agent ?? 0,
    prices: [
      {
        membership_plan_id: 1,
        plan_code: "free",
        plan_name: "Basic",
        is_default: true,
        price: variant?.prices.public ?? 0,
        margin_percent: null,
      },
      {
        membership_plan_id: 2,
        plan_code: "platinum",
        plan_name: "Platinum",
        is_default: false,
        price: variant?.prices.vip ?? 0,
        margin_percent: null,
      },
      {
        membership_plan_id: 3,
        plan_code: "gold",
        plan_name: "Gold",
        is_default: false,
        price: variant?.prices.agent ?? 0,
        margin_percent: null,
      },
    ],
    status: row.status === "active",
    is_available: row.is_available,
    is_price_hidden: row.is_price_hidden ?? false,
    // Derived server-side from the product AND its supplier mapping; the fixture
    // carries it so the row menu can offer Publish or Unpublish.
    publish_state: row.publish_state,
    can_publish: row.can_publish,
    publish_blocked_reason: row.publish_blocked_reason,
    category: { id: categoryId, name: row.game_name },
    sub_category: { id: 1, name: row.category_name },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
};

/**
 * Endpoints that are a fixed document rather than a CRUD collection. Matched
 * by exact URL before the collection router runs, and served in the API's
 * shape so the services' mappers do their real work here too.
 */
const CARD_KEYS = ["credit", "debit", "profit"] as const;
const DASHBOARD_CARD_KEYS = ["credit", "debit", "todays_sales"] as const;

const DOCUMENTS: Record<string, unknown> = {
  "/v1/financial/summary": summaryCardsFor(i18n.getFixedT(null, "financial")).map((card, index) => ({
    key: CARD_KEYS[index] ?? card.id,
    value: card.value,
    delta_pct: card.deltaPct ?? null,
    direction: card.direction ?? null,
    caption: card.caption,
  })),
  "/v1/financial/payment-gateways": PAYMENT_GATEWAYS.map((row) => ({
    id: row.id,
    name: row.name,
    active_balance: row.activeBalance,
    held_balance: row.heldBalance,
  })),
  "/v1/financial/suppliers": SUPPLIERS.map((row, index) => ({
    id: index + 1,
    name: row.name,
    balance: row.balance,
  })),
  "/v1/dashboard/stats": {
    totals: { users: 190, transactions: TRANSACTIONS.length },
    stat_cards: STAT_CARDS.map((card, index) => ({
      key: DASHBOARD_CARD_KEYS[index] ?? card.id,
      value: card.value,
      delta_pct: card.deltaPct ?? null,
      direction: card.direction ?? null,
      caption: card.caption,
    })),
    pending_orders: {
      manual_orders: PENDING_ORDERS.manualOrders,
      pending_payment: PENDING_ORDERS.pendingPayment,
      processing: PENDING_ORDERS.processing,
      failed_transaction: PENDING_ORDERS.failedTransaction,
    },
    chart: CHART_SERIES.january.map((point) => ({
      date: point.date,
      transactions: 0,
      revenue: point.revenue,
      net_income: point.netIncome,
    })),
  },
  "/v1/settings": [
    { id: 1, group: "general", key: "site_name", value: "TopUpGame.ID", type: "string", label: "Site Name", is_public: true },
    { id: 2, group: "contact", key: "contact_whatsapp", value: "6281234567890", type: "string", label: "WhatsApp", is_public: true },
    { id: 3, group: "general", key: "maintenance_mode", value: "0", type: "boolean", label: "Maintenance Mode", is_public: true },
    {
      id: 4,
      group: "general",
      // `logo`, matching SettingSeeder — the page special-cases that key for the
      // formats it accepts, and a fixture that renamed it left that branch
      // unreachable.
      key: "logo",
      value: null,
      value_url: null,
      type: "image",
      label: "Logo",
      is_public: true,
    },
    {
      id: 5,
      group: "payment",
      key: "balance_topup_presets",
      value: "[10000,25000,50000]",
      type: "json",
      label: "Top-up Nominal Presets",
      is_public: true,
    },
    {
      id: 6,
      group: "operational",
      key: "order_expiry_minutes",
      value: '{"virtual_account":15,"qris":20,"ewallet":125,"payment_link":605,"convenience_store":1445}',
      type: "json",
      label: "Order Expiry (minutes)",
      is_public: false,
    },
    // Present on purpose, though the API no longer serves either group: the
    // panel and the API deploy separately, and an older API must not be able to
    // put a Hub-owned licence or a per-plan markup back on screen — or into the
    // save payload — just because it still sends the rows.
    {
      id: 7,
      group: "licence",
      key: "is_serving",
      value: "1",
      type: "boolean",
      label: "Lisensi situs: is_serving",
      is_public: false,
    },
    {
      id: 8,
      group: "pricing",
      key: "default_markup_percent",
      value: "20",
      type: "number",
      label: "Default Markup (%)",
      is_public: false,
    },
  ],
  // This site's own platform subscription — feeds the sidebar footer card,
  // which is mounted on every admin route.
  "/v1/website-subscription": {
    status: "expiring_soon",
    service: { id: 1, code: "uxiolabs", name: "Website Topup" },
    ends_at: "2026-09-14T00:00:00.000Z",
    days_remaining: 9,
    checkout_url: "https://pay.example.test/app/payment-admin/services/1/checkout",
    // The Hub-marked lines that carry the term, each with its own duration.
    services: [
      {
        service_code: "uxiolabs",
        service_name: "Website Topup",
        billing_mode: "billed",
        duration_days: 365,
        governs_licence: true,
        lifetime: false,
        active_until: "2026-09-14T00:00:00.000Z",
      },
    ],
  },
  "/v1/transactions/status-counts": { pending: 12, processing: 32, failed_provider: 8, refunded: 3 },
  "/v1/refunds/status-counts": {
    WAITING_ACCOUNT: 2,
    WAITING_DETAILS: 1,
    PENDING: 1,
    PROCESSING: 0,
    COMPLETED: 7,
    unclaimed: 2,
    overdue: 1,
  },
  "/v1/payout-banks": [
    { code: "BCA", name: "Bank Central Asia (BCA)", is_ewallet: false },
    { code: "MANDIRI", name: "Bank Mandiri", is_ewallet: false },
    { code: "DANA", name: "DANA", is_ewallet: true },
  ],
  "/v1/integration/channels": CHANNELS.map((row) => ({
    id: row.id,
    type: row.type,
    name: row.name,
    connection_status: row.connection_status,
    balance: row.balance ?? null,
    last_ping_at: row.last_ping_at,
  })),
};

const TO_API_INVOICE_STATUS: Record<string, string> = {
  pending: "PENDING",
  processing: "PROCESSING",
  success: "COMPLETED",
  failed: "FAILED_PROVIDER",
  refunded: "REFUNDED",
  partial_success: "PROCESSING",
};

/** The legacy numeric encoding, still emitted so the service's fallback path stays exercised. */
const TO_API_PAYMENT_STATUS: Record<string, string> = {
  pending: "1",
  expired: "2",
  success: "3",
  refunded: "4",
  none: "1",
};

/** The `GatewayStatus` word the split-aware API sends alongside it. */
const TO_API_PAYMENT_WORD: Record<string, string> = {
  pending: "PENDING",
  expired: "EXPIRED",
  success: "SUCCESS",
  refunded: "REFUNDED",
};

const TO_API_PROVIDER_STATUS: Record<string, string> = {
  not_ordered: "NOT_ORDERED",
  queued: "QUEUED",
  sending: "SENDING",
  ordered: "ORDERED",
  unconfirmed: "UNCONFIRMED",
  delivered: "DELIVERED",
  rejected: "REJECTED",
  undelivered: "UNDELIVERED",
};

const toApiTransaction = (row: (typeof TRANSACTIONS)[number], index: number): Row => ({
  id: index + 1,
  invoice_number: row.invoice_no,
  user_id: row.customer.user_id,
  guest_contact: row.customer.user_id === null ? row.customer.phone : null,
  target_uid: row.target_ref ?? null,
  target_server: null,
  amount_fee: row.admin_fee ?? 0,
  amount_total: row.cost,
  margin: row.profit ?? 0,
  status: TO_API_INVOICE_STATUS[row.invoice_status] ?? "PENDING",
  // An order with no gateway keeps both new fields absent, which is also the
  // shape an API that predates the split sends — so the fallback stays covered.
  ...(row.payment_status === "none"
    ? {}
    : {
        provider_status: TO_API_PROVIDER_STATUS[row.provider_status] ?? "NOT_ORDERED",
        payment_status: TO_API_PAYMENT_WORD[row.payment_status],
      }),
  sn: row.serial_number ?? null,
  proof_url: row.proof_url ?? null,
  user: row.customer.user_id
    ? { id: row.customer.user_id, name: row.customer.name, phone: row.customer.phone, avatar_url: null }
    : null,
  product: { id: index + 1, name: row.product.name, category: { id: index + 1, name: row.game.name } },
  payment: {
    status: TO_API_PAYMENT_STATUS[row.payment_status] ?? "1",
    reference_id: `PAY-${row.invoice_no}`,
    pg_transaction_id: `PG-${index + 1}`,
    gross_amount: row.cost,
    paid_at: row.payment_status === "success" ? row.updated_at : null,
  },
  payment_channel: { id: index + 1, name: row.payment_method },
  // The detail read keeps these; the list mapper drops them. Derived from the
  // same fixture row so the fixtures themselves need no new fields.
  amount_base: row.cost - (row.admin_fee ?? 0),
  channel_fee: row.admin_fee ?? 0,
  discount_amount: 0,
  is_manual: false,
  supplier_trx_id: `SUP-${index + 1}`,
  supplier_status: row.invoice_status === "success" ? "success" : "pending",
  supplier: { id: index + 1, name: "Uxiolabs" },
  created_at: row.created_at,
  updated_at: row.updated_at,
});

/** Suppliers back the provider select, which submits a real supplier_id. */
const SUPPLIER_NAMES = ["Uxiolabs", "Zelpoint", "Topupkuy"];

/**
 * Managed provider products (redesigned Product Provider tab). Served in the
 * `/v1/supplier-products` row shape so the service mapper runs for real. One
 * System row (protected: no checkbox, no delete) and one Uxiolabs row.
 */
const SUPPLIER_PRODUCTS = (): Row[] => {
  const priced = (modal: number) => ({
    price_modal: modal,
    price_member: Math.ceil(modal * 1.2),
    price_vip: Math.ceil(modal * 1.15),
    price_reseller: Math.ceil(modal * 1.1),
    price_agent: Math.ceil(modal * 1.05),
  });
  // What the API projects for a pooled row: one price per active membership
  // plan, carrying its label. The four-tier `preview_prices` it replaced is
  // what silently rendered every price as Rp 0 once the API stopped sending it.
  const previewPlanPrices = (modal: number) => [
    { membership_plan_id: 1, plan_code: "free", plan_name: "Basic", is_default: true, price: Math.ceil(modal * 1.2) },
    { membership_plan_id: 2, plan_code: "platinum", plan_name: "Platinum", is_default: false, price: Math.ceil(modal * 1.1) },
    { membership_plan_id: 3, plan_code: "gold", plan_name: "Gold", is_default: false, price: Math.ceil(modal * 1.05) },
  ];
  return [
    {
      id: 1,
      product_id: null,
      buyer_sku_code: "MEMBERSHIP_VIP",
      provider_name: "Membership VIP",
      price: 58745,
      is_active: false,
      is_price_locked: false,
      is_system: true,
      buyer_product_status: true,
      pool_state: "ready",
      can_promote: true,
      promote_blocked_reason: null,
      price_min: null,
      price_max: null,
      pool_category: { id: 1, name: "Membership" },
      preview_prices: null,
      preview_plan_prices: [],
      plan_margins: [],
      point_percent: null,
      point_flat: null,
      margins: { member: null, vip: null, reseller: null, agent: null },
      product: {
        id: 101,
        name: "Membership VIP",
        code: "MEMBERSHIP_VIP",
        ...priced(58745),
        status: true,
        category: { id: 1, name: "Membership" },
      },
      supplier: { id: 3, name: "Internal System", is_system: true },
      created_at: "2026-03-08T07:32:00.000000Z",
    },
    {
      id: 2,
      product_id: null,
      buyer_sku_code: "MLID_19_S1",
      provider_name: "MOBILELEGEND - 19 Diamond",
      price: 4865,
      is_active: false,
      is_price_locked: false,
      is_system: false,
      buyer_product_status: true,
      pool_state: "ready",
      can_promote: true,
      promote_blocked_reason: null,
      price_min: null,
      price_max: null,
      pool_category: { id: 2, name: "Mobile Legends Indonesia" },
      preview_prices: null,
      preview_plan_prices: [],
      plan_margins: [],
      point_percent: null,
      point_flat: null,
      margins: { member: null, vip: null, reseller: null, agent: null },
      product: {
        id: 102,
        name: "MOBILELEGEND - 19 Diamond",
        code: "MLID_19_S1",
        ...priced(4865),
        status: true,
        category: { id: 2, name: "Mobile Legends Indonesia" },
      },
      supplier: { id: 1, name: "Uxiolabs", is_system: false },
      created_at: "2026-03-10T21:58:00.000000Z",
    },
    // A pooled row: no product behind it, prices are a projection, and it is
    // blocked from promotion until a margin is decided.
    {
      id: 3,
      product_id: null,
      buyer_sku_code: "VAL120",
      provider_name: "Valorant 120 Points",
      price: 15000,
      is_active: false,
      is_price_locked: false,
      is_system: false,
      buyer_product_status: true,
      pool_state: "needs_margin",
      can_promote: false,
      promote_blocked_reason: "Set profit margin terlebih dahulu sebelum promote.",
      price_min: null,
      price_max: null,
      pool_category: { id: 3, name: "Valorant" },
      preview_prices: priced(15000),
      preview_plan_prices: previewPlanPrices(15000),
      plan_margins: [],
      point_percent: null,
      point_flat: null,
      margins: { member: null, vip: null, reseller: null, agent: null },
      product: null,
      supplier: { id: 1, name: "Uxiolabs", is_system: false },
      created_at: "2026-08-24T10:00:00.000000Z",
    },
    // Pooled and priced — the one row Promote will accept.
    {
      id: 4,
      product_id: null,
      buyer_sku_code: "VAL420",
      provider_name: "Valorant 420 Points",
      price: 50000,
      is_active: false,
      is_price_locked: false,
      is_system: false,
      buyer_product_status: true,
      pool_state: "ready",
      can_promote: true,
      promote_blocked_reason: null,
      price_min: null,
      price_max: null,
      pool_category: { id: 3, name: "Valorant" },
      preview_prices: priced(50000),
      preview_plan_prices: previewPlanPrices(50000),
      plan_margins: [
        { membership_plan_id: 1, margin_percent: 20 },
        { membership_plan_id: 3, margin_percent: 5 },
      ],
      point_percent: 2.5,
      point_flat: 50,
      margins: { member: 20, vip: 15, reseller: 10, agent: 5 },
      product: null,
      supplier: { id: 1, name: "Uxiolabs", is_system: false },
      created_at: "2026-08-24T10:05:00.000000Z",
    },
  ];
};

const SEEDS: Record<string, () => Row[]> = {
  "suppliers": () => SUPPLIER_NAMES.map((name, index) => ({ id: index + 1, name, status: true })),
  "categories": () => CATEGORIES.map(toApiCategory),
  "sub-categories": () => SUB_CATEGORIES.map(toApiSubCategory),
  "category-types": () => CATEGORY_TYPES.map(toApiCategoryType),
  "server-categories": () => CATEGORY_SERVERS.map(toApiServerCategory),
  "server-category-options": () => [],
  "supplier-categories": () => CATEGORY_PROVIDERS.map(toApiSupplierCategory),
  "products": () => PRODUCTS.map(toApiProduct),
  "supplier-products": () => SUPPLIER_PRODUCTS(),
  "transactions": () => TRANSACTIONS.map(toApiTransaction),
  // Two refunds, one per path: a guest waiting on a manual transfer (the row
  // the queue exists for) and a member already credited to their balance.
  "refunds": () => [
    {
      id: 1,
      refund_number: "RFD-a1b2c3d4e5f6",
      method: "manual_transfer",
      status: "PENDING",
      amount: 12000,
      transaction: {
        id: 1,
        invoice_number: "INV-20260830-ABC123",
        product: "86 Diamonds",
        created_at: "2026-08-30T10:00:00.000Z",
      },
      customer: {
        user_id: null,
        name: null,
        email: "guest@example.com",
        phone: "081234567890",
        is_guest: true,
      },
      payout: {
        bank_code: "BCA",
        bank_name: "Bank Central Asia (BCA)",
        account_number: "1234567890",
        account_name: "Guest Customer",
        account_phone: null,
        submitted_at: "2026-08-30T11:00:00.000Z",
        submitted_by: "customer",
      },
      claim_notified_at: "2026-08-30T10:01:00.000Z",
      processed_by: null,
      processed_at: null,
      proof_url: null,
      admin_note: null,
      reject_reason: null,
      refunded_at: null,
      settlement_reversed_at: null,
      created_at: "2026-08-30T10:00:30.000Z",
      claimed_account: null,
      verify_due_at: null,
      is_overdue: false,
      claim_rejected_count: 0,
    },
    {
      id: 2,
      refund_number: "RFD-f6e5d4c3b2a1",
      method: "balance",
      status: "COMPLETED",
      amount: 25000,
      transaction: {
        id: 2,
        invoice_number: "INV-20260830-XYZ789",
        product: "170 Diamonds",
        created_at: "2026-08-30T09:00:00.000Z",
      },
      customer: {
        user_id: 1001,
        name: "Randy Galang",
        email: "randy@example.com",
        phone: "6289876543210",
        is_guest: false,
      },
      payout: null,
      claim_notified_at: null,
      processed_by: null,
      processed_at: null,
      proof_url: null,
      admin_note: null,
      reject_reason: null,
      refunded_at: "2026-08-30T09:00:10.000Z",
      settlement_reversed_at: "2026-08-30T09:00:10.000Z",
      created_at: "2026-08-30T09:00:05.000Z",
      claimed_account: null,
      verify_due_at: null,
      is_overdue: false,
      claim_rejected_count: 0,
    },
    {
      // The current scheme: a guest came back with an account and is waiting on
      // an admin to verify it. Overdue, so the SLA affordances are covered too.
      id: 3,
      refund_number: "RFD-c1a2i3m4e5d6",
      method: "balance_claim",
      status: "PENDING",
      amount: 30000,
      transaction: {
        id: 3,
        invoice_number: "INV-20260901-CLM001",
        product: "355 Diamonds",
        created_at: "2026-08-31T08:00:00.000Z",
      },
      customer: {
        user_id: null,
        name: null,
        email: "claimer@example.com",
        phone: "081200001111",
        is_guest: true,
      },
      payout: null,
      claim_notified_at: "2026-08-31T08:01:00.000Z",
      processed_by: null,
      processed_at: null,
      proof_url: null,
      admin_note: null,
      reject_reason: null,
      refunded_at: null,
      settlement_reversed_at: null,
      created_at: "2026-08-31T08:00:30.000Z",
      claimed_account: {
        user_id: 2002,
        name: "Claiming Customer",
        email: "claimer@example.com",
        phone: "081200001111",
        claimed_at: "2026-08-31T09:00:00.000Z",
        account_status: "active",
        contact_match: "email",
        contact_value: "claimer@example.com",
        sibling_claims: 0,
      },
      verify_due_at: "2026-09-02T09:00:00.000Z",
      is_overdue: true,
      claim_rejected_count: 0,
    },
  ],
  // Pricing tiers are membership plans now: the margin form and the pricing
  // rule select both build their fields from this list rather than from a
  // hardcoded four.
  "membership-plans": () => [
    { id: 1, code: "free", name: { id: "Basic", en: "Basic" }, price: 0, duration_days: null, is_active: true, is_default: true, sort_order: 0 },
    // Production ships two plans displaying as "Basic" (the default free tier
    // and the paid one), which is why the form labels them by code.
    { id: 4, code: "basic", name: { id: "Basic", en: "Basic" }, price: 50000, duration_days: null, is_active: true, is_default: false, sort_order: 1 },
    { id: 2, code: "platinum", name: { id: "Platinum", en: "Platinum" }, price: 150000, duration_days: null, is_active: true, is_default: false, sort_order: 2 },
    { id: 3, code: "gold", name: { id: "Gold", en: "Gold" }, price: 300000, duration_days: null, is_active: true, is_default: false, sort_order: 3 },
  ],
  // Markup rules driving the price an empty margin falls back to. A null plan
  // is the global fallback; a plan-keyed rule overrides it. Read by the Add
  // Products preview (the pricing page test mocks pricingService.list).
  "pricing-rules": () => [
    { id: 1, category_id: null, membership_plan_id: null, markup_percent: 20, markup_flat: 0, category: null, membership_plan: null },
    { id: 2, category_id: null, membership_plan_id: 1, markup_percent: 25, markup_flat: 0, category: null, membership_plan: null },
  ],
  "article-categories": () =>
    ["promo", "mobile-legend", "free-fire"].map((key, index) => ({
      id: index + 1,
      name: key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      key,
      sort_order: index,
      status: true,
      created_at: "2026-07-01",
      updated_at: "2026-07-01",
    })),
  "articles": () =>
    [
      ["Cara Top Up Diamond Lebih Hemat", "article"],
      ["Promo Spesial Hari Raya", "news"],
      ["Panduan Top Up UC Aman", "article"],
    ].map(([title, type], index) => ({
      id: index + 1,
      article_category_id: (index % 3) + 1,
      category_label: null,
      type,
      locale: "id",
      title,
      slug: String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      excerpt: "Ringkasan singkat.",
      author_name: "Admin_Topupgame",
      body_sections: [{ heading: "Bagian", paragraphs: ["Paragraf."] }],
      image_url: null,
      is_published: true,
      is_featured: index === 0,
      published_at: "2026-05-01T09:00:00Z",
      view_count: 0,
      meta_title: null,
      meta_description: null,
      meta_keywords: [],
      meta_robots: "index,follow",
      category: { id: (index % 3) + 1, name: "Mobile Legend", key: "mobile-legend", sort_order: 0, status: true, created_at: "", updated_at: "" },
      created_at: "2026-05-01",
      updated_at: "2026-05-01",
    })),
  "faqs": () =>
    ["Bagaimana cara melakukan top up?", "Berapa lama proses top up?"].map((question, index) => ({
      id: index + 1,
      question,
      answer: "Jawaban lengkap.",
      group: null,
      locale: "id",
      sort_order: index,
      is_active: true,
      created_at: "2026-07-01",
      updated_at: "2026-07-01",
    })),
  "pages": () =>
    [["kebijakan-privasi", "Kebijakan Privasi"], ["syarat-ketentuan", "Syarat & Ketentuan"]].map(
      ([slug, title], index) => ({
        id: index + 1,
        slug,
        locale: "id",
        title,
        intro: ["Pembuka."],
        sections: [{ heading: "Cookies", paragraphs: ["Isi."] }],
        is_published: true,
        meta_title: title,
        meta_description: null,
        meta_robots: "noindex,follow",
        created_at: "2026-07-01",
        updated_at: "2026-07-01",
      }),
    ),
  "promos": () =>
    [["HEMAT10", "percentage", 10, true], ["GAJIAN20", "percentage", 20, false]].map(
      ([code, type, value, isPublic], index) => ({
        id: index + 1,
        code,
        name: `Diskon ${value}%`,
        description: null,
        type,
        value,
        max_discount: 10000,
        min_purchase: 20000,
        scope: "global",
        scope_id: null,
        quota_total: 1000,
        quota_per_user: 3,
        used_count: index * 5,
        starts_at: "2026-07-24T00:00:00Z",
        ends_at: "2026-08-30T00:00:00Z",
        is_public: isPublic,
        is_active: true,
        created_at: "2026-07-24",
        updated_at: "2026-07-24",
      }),
    ),
  "flash-sales": () => [
    {
      id: 1,
      name: "Flash Sale Mingguan",
      starts_at: "2026-07-31T00:00:00Z",
      ends_at: "2026-08-02T00:00:00Z",
      is_active: true,
      is_running: true,
      items: [
        {
          id: 1,
          product_id: 18,
          product_name: "Indosat 30.000",
          sale_price: 31187,
          original_price: 36690,
          stock_total: 100,
          stock_sold: 20,
          stock_available: 80,
          sort_order: 0,
        },
      ],
      created_at: "2026-07-31",
      updated_at: "2026-07-31",
    },
  ],
  "payment-channels": () =>
    [["BCA Virtual Account", "bca_va", "virtual_account"], ["QRIS All Payment", "qris", "qris"]].map(
      ([name, code, type], index) => ({
        id: index + 1,
        payment_type: type,
        channel_code: code,
        name,
        logo_path: null,
        logo_url: null,
        description: null,
        min_amount: 10000,
        fee_flat: 4000,
        fee_percent: 0,
        sort_order: index,
        is_active: true,
        is_single_use: false,
        created_at: "2026-07-31",
        updated_at: "2026-07-31",
      }),
    ),
  "users": () =>
    [["Randy Galang", "randy@example.com"], ["Sinta Dewi", "sinta@example.com"]].map(([name, email], index) => ({
      id: index + 1,
      role_id: 2,
      role: "member",
      name,
      username: null,
      avatar_url: null,
      email,
      phone: "6281234567890",
      balance: 15000,
      point: 120,
      locale: "id",
      email_verified_at: "2026-07-01T00:00:00Z",
      created_at: "2026-07-01",
      updated_at: "2026-07-01",
    })),
  "banners": () =>
    ["Promo Ramadan 2026", "Flash Sale Weekend"].map((name, index) => ({
      id: index + 1,
      category_id: null,
      name,
      image_path: "/banners/x.jpg",
      image_url: "http://localhost/storage/banners/x.jpg",
      link: "https://uxio.id/promo",
      scope: "global",
      category: null,
      created_at: "2026-07-31",
      updated_at: "2026-07-31",
    })),
  "announcements": () =>
    ["Server maintenance terjadwal pada hari Minggu."].map((content, index) => ({
      id: index + 1,
      category_id: null,
      content,
      image_path: null,
      image_url: null,
      is_active: true,
      scope: "global",
      category: null,
      created_at: "2026-07-31",
      updated_at: "2026-07-31",
    })),
  "testimonials": () =>
    ["Rizky Pratama", "Siti Nurhaliza"].map((name, index) => ({
      id: index + 1,
      author_name: name,
      author_title: "Mobile Legends Player",
      avatar_url: null,
      content: "Top up selalu cepat.",
      rating: 5,
      game_name: "Mobile Legends",
      is_featured: index === 0,
      sort_order: index,
      is_active: true,
      created_at: "2026-07-01",
      updated_at: "2026-07-01",
    })),
  // Two entries per transaction, so the per-order modal has a real trail to
  // render and the global dashboard feed still has rows of its own.
  // Account-level entries first: the dashboard's Recent Activity card reads
  // the unfiltered feed with per_page 10, and the per-order entries below are
  // reached through the transaction_id filter rather than by being recent.
  "activity-logs": () => [
    ...ACTIVITY_LOG.map((row, index) => ({
      id: index + 1,
      user_id: index + 1,
      transaction_id: null,
      type: "security",
      actor: row.actor,
      role: row.role,
      ip_address: "192.168.1.10",
      user_agent: "Mozilla/5.0",
      message: row.action,
      created_at: row.timestamp,
    })),
    ...TRANSACTIONS.flatMap((row, index) =>
      row.activity_log.map((entry, entryIndex) => ({
        id: (index + 1) * 100 + entryIndex,
        user_id: entry.actor === "system" ? null : index + 1,
        transaction_id: index + 1,
        type: "transaction",
        actor: entry.actor === "system" ? "System" : entry.actor.name,
        role: entry.actor === "system" ? null : "admin",
        ip_address: entry.actor === "system" ? null : "192.168.1.11",
        user_agent: "Mozilla/5.0",
        message: entry.description,
        created_at: entry.created_at,
      })),
    ),
  ],
  // Customer feedback (ratings) — shaped like RatingResource. One member row and
  // one guest row (user_id null + generated guest_name) so the admin Feedback
  // page can assert both the named-reviewer and Guest-badge paths.
  "ratings": () => [
    {
      id: 1,
      transaction_id: 1,
      user_id: 12,
      guest_name: null,
      rating: 5,
      comment: "Prosesnya cepat, mantap!",
      user: { id: 12, name: "Budi Santoso", username: "budi88" },
      transaction: { id: 1, invoice_number: "INV-20260807-ABC123", product: { name: "Mobile Legends 100 Diamond" } },
      created_at: "2026-08-07T10:00:00.000Z",
    },
    {
      id: 2,
      transaction_id: 2,
      user_id: null,
      guest_name: "Guest K48213",
      rating: 4,
      comment: null,
      user: null,
      transaction: { id: 2, invoice_number: "INV-20260807-XYZ999", product: { name: "Free Fire 70 Diamond" } },
      created_at: "2026-08-07T11:00:00.000Z",
    },
  ],
};

/** Free-text fields per collection, so `?search=` narrows the way the API does. */
const SEARCHABLE: Record<string, string[]> = {
  "suppliers": ["name"],
  "categories": ["name", "code"],
  "sub-categories": ["name", "currency_name"],
  "category-types": ["name"],
  "server-categories": ["name"],
  "supplier-categories": ["provider_category"],
  "products": ["name", "code"],
  "supplier-products": ["buyer_sku_code", "provider_name"],
  "transactions": ["invoice_number"],
  "refunds": ["refund_number"],
  "articles": ["title"],
  "article-categories": ["name"],
  "faqs": ["question"],
  "pages": ["title", "slug"],
  "testimonials": ["author_name"],
  "promos": ["code", "name"],
  "flash-sales": ["name"],
  "payment-channels": ["name", "channel_code"],
  "users": ["name", "email"],
  "banners": ["name"],
  "announcements": ["content"],
  "activity-logs": ["message"],
};

const envelope = <T>(data: T) => ({ status: "success", code: 200, message: "ok", data });

/**
 * Uxiolabs price list (Product Provider tab). Served in the backend's row shape
 * so the provider service's mapper runs for real; `X100` is pre-mapped so the
 * "Add" action's disabled/"Mapped" states have something to assert against.
 */
const UXIOLABS_PRICE_LIST: Row[] = [
  {
    buyer_sku_code: "X100",
    name: "Xl 100.000",
    category: "Pulsa",
    cost: 98000,
    harga: 98000,
    harga_gold: 97800,
    harga_silver: 97900,
    harga_pro: 97700,
    available: true,
    already_mapped: true,
  },
  {
    buyer_sku_code: "S5",
    name: "Telkomsel Pulsa 5.000",
    category: "Pulsa",
    cost: 5100,
    harga: 5100,
    harga_gold: 5000,
    harga_silver: 5050,
    harga_pro: 4950,
    available: true,
    already_mapped: false,
  },
  {
    buyer_sku_code: "ML86",
    name: "Mobile Legends 86 Diamond",
    category: "Mobile Legends",
    cost: 20000,
    harga: 20000,
    harga_gold: 19800,
    harga_silver: 19900,
    harga_pro: 19700,
    available: true,
    already_mapped: true,
  },
  {
    buyer_sku_code: "VAL120",
    name: "Valorant 120 Points",
    category: "Valorant",
    cost: 15000,
    harga: 15000,
    harga_gold: 14800,
    harga_silver: 14900,
    harga_pro: 14700,
    available: true,
    already_mapped: false,
  },
  {
    buyer_sku_code: "VAL420",
    name: "Valorant 420 Points",
    category: "Valorant",
    cost: 50000,
    harga: 50000,
    harga_gold: 49800,
    harga_silver: 49900,
    harga_pro: 49700,
    available: false,
    already_mapped: false,
  },
];

/**
 * The provider's categories, grouped and de-duplicated the way the API does it:
 * one row per distinct `category`, however many SKUs share it, annotated with
 * whether a Category Provider already maps it.
 */
const uxiolabsCategories = (): Row[] => {
  const groups = new Map<string, { sku_count: number; available_count: number }>();

  for (const row of UXIOLABS_PRICE_LIST) {
    const key = String(row.category);
    const group = groups.get(key) ?? { sku_count: 0, available_count: 0 };
    group.sku_count += 1;
    if (row.available) group.available_count += 1;
    groups.set(key, group);
  }

  const mapped = new Map(CATEGORY_PROVIDERS.map((row, index) => [row.provider_category, index + 1]));

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, counts]) => ({
      value,
      sku_count: counts.sku_count,
      available_count: counts.available_count,
      mapped_category_id: mapped.get(value) ?? null,
      mapped_category_name: mapped.has(value) ? `Mapped ${value}` : null,
    }));
};

/**
 * Add-panel feed. Only categories with a Category Provider mapping are offered —
 * the rule that makes adding a Category Provider the act that surfaces a game's
 * catalogue — and the defaults match the API's (`new` + `available`).
 */
const uxiolabsPoolCandidates = (params: Record<string, unknown>): Row[] => {
  // Which provider categories have a Category Provider mapping, as the API
  // resolves it from `supplier_categories`. Deliberately independent of the
  // admin-list fixture: that one exists to exercise the table, and coupling the
  // two made every added mapping shift unrelated tests.
  const configured = new Set(["Mobile Legends", "Valorant"]);
  const poolState = (params.pool_state as string | undefined) ?? "new";
  const availability = (params.availability as string | undefined) ?? "available";
  const search = (params.search as string | undefined)?.toLowerCase();
  const providerCategory = params.provider_category as string | undefined;
  const costMin = params.cost_min === undefined ? undefined : Number(params.cost_min);
  const costMax = params.cost_max === undefined ? undefined : Number(params.cost_max);
  const sort = params.sort as string | undefined;

  const sorted = (rows: Row[]): Row[] => {
    const by = (a: Row, b: Row, key: "name" | "cost") =>
      key === "cost"
        ? Number(a.cost) - Number(b.cost)
        : String(a.name).localeCompare(String(b.name), undefined, { numeric: true });

    switch (sort) {
      case "cost_asc":
        return [...rows].sort((a, b) => by(a, b, "cost"));
      case "cost_desc":
        return [...rows].sort((a, b) => by(b, a, "cost"));
      case "name_asc":
        return [...rows].sort((a, b) => by(a, b, "name"));
      case "name_desc":
        return [...rows].sort((a, b) => by(b, a, "name"));
      default:
        // No sort leaves the provider's own feed order, same as the API.
        return rows;
    }
  };

  return sorted(
    UXIOLABS_PRICE_LIST.filter((row) => configured.has(String(row.category)))
    .map((row) => ({
      buyer_sku_code: row.buyer_sku_code,
      name: row.name,
      provider_category: row.category,
      mapped_category_name: `Mapped ${row.category}`,
      cost: row.cost,
      available: row.available,
      already_pooled: Boolean(row.already_mapped),
      already_promoted: Boolean(row.already_mapped),
      is_new: !row.already_mapped,
    }))
    .filter((row) => {
      if (poolState === "new" && (!row.is_new || row.already_pooled)) return false;
      if (poolState === "not_pooled" && row.already_pooled) return false;
      if (availability === "available" && !row.available) return false;
      if (availability === "unavailable" && row.available) return false;
      if (providerCategory && row.provider_category !== providerCategory) return false;
      if (costMin !== undefined && Number(row.cost) < costMin) return false;
      if (costMax !== undefined && Number(row.cost) > costMax) return false;
      if (search) {
        const haystack = [row.name, row.buyer_sku_code, row.provider_category].join(" ").toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
      }),
  );
};

/** Filter options, computed over the whole configured universe like the API. */
const uxiolabsPoolFacets = () => {
  const all = uxiolabsPoolCandidates({ pool_state: "all", availability: "all" });
  const byProvider = new Map<string, number>();

  for (const row of all) {
    const key = String(row.provider_category);
    byProvider.set(key, (byProvider.get(key) ?? 0) + 1);
  }

  const costs = all.map((row) => Number(row.cost));

  return {
    provider_categories: [...byProvider.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider_category, count]) => ({
        provider_category,
        mapped_category_name: `Mapped ${provider_category}`,
        count,
      })),
    categories: [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count], index) => ({
      id: index + 1,
      name: `Mapped ${name}`,
      count,
    })),
    cost: { min: costs.length ? Math.min(...costs) : 0, max: costs.length ? Math.max(...costs) : 0 },
  };
};

const uxiolabsPriceList = (params: Record<string, unknown>): Row[] => {
  const search = (params.search as string | undefined)?.toLowerCase();
  return UXIOLABS_PRICE_LIST.filter((row) => {
    if (params.only_unmapped && row.already_mapped) return false;
    if (search) {
      const haystack = [row.name, row.buyer_sku_code, row.category]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
};

const paginate = (rows: Row[], params: Record<string, unknown> = {}) => {
  const page = Number(params.page ?? 1);
  const perPage = Number(params.per_page ?? 10);
  const start = (page - 1) * perPage;
  const pageRows = rows.slice(start, start + perPage);
  const lastPage = Math.max(1, Math.ceil(rows.length / perPage));

  return envelope({
    data: pageRows,
    links: {
      first: "?page=1",
      last: `?page=${lastPage}`,
      prev: page > 1 ? `?page=${page - 1}` : null,
      next: page < lastPage ? `?page=${page + 1}` : null,
    },
    meta: {
      current_page: page,
      from: pageRows.length ? start + 1 : null,
      last_page: lastPage,
      path: "/",
      per_page: perPage,
      to: pageRows.length ? start + pageRows.length : null,
      total: rows.length,
    },
  });
};

/** Documents whose payload varies with the query string. */
const PARAMETERIZED: Record<string, (params: Record<string, unknown>) => unknown> = {
  "/v1/dashboard/performance": (params) => {
    const tab = (params.tab as keyof typeof PERFORMANCE_ROWS) ?? "category";
    return (PERFORMANCE_ROWS[tab] ?? []).map((row, index) => ({
      id: index + 1,
      name: row.name,
      sub_label: row.subLabel,
      total_transaction: row.totalTransaction,
      revenue: row.revenue,
    }));
  },
};

/** `/v1/sub-categories/3` → `["sub-categories", "3"]` */
const parsePath = (url: string): [string, string | undefined] => {
  const [, collection, id] = url.replace(/^\/v1\//, "/").split("/");
  return [collection, id];
};

const readForm = (body: unknown): Row => {
  if (!(body instanceof FormData)) return (body as Row) ?? {};
  const out: Row = {};
  body.forEach((value, key) => {
    if (key === "_method") return;
    out[key] = value;
  });
  return out;
};

export function createFakeApi() {
  const store: Record<string, Row[]> = Object.fromEntries(
    Object.entries(SEEDS).map(([key, seed]) => [key, clone(seed())]),
  );
  let nextId = 1000;

  const matches = (collection: string, row: Row, params: Record<string, unknown>) => {
    const search = params.search as string | undefined;
    if (search) {
      const fields = SEARCHABLE[collection] ?? ["name"];
      const haystack = fields.map((field) => String(row[field] ?? "")).join(" ").toLowerCase();
      if (!haystack.includes(search.toLowerCase())) return false;
    }
    // Comma-joined id selection, as the Set Profit Margin page sends it.
    if (params.ids) {
      const wanted = String(params.ids).split(",").filter(Boolean);
      if (!wanted.includes(String(row.id))) return false;
    }
    if (params.pool_state && String(row.pool_state) !== String(params.pool_state)) return false;
    // The pool is what is still in the pool. A promoted SKU has left it for the
    // Main Products list; an explicit `ids` selection or a promoted `pool_state`
    // is the deliberate way past that.
    if (collection === "supplier-products" && !params.ids) {
      const promoted = row.pool_state === "draft" || row.pool_state === "published";
      const askedForPromoted = params.pool_state === "draft" || params.pool_state === "published";
      if (promoted && !askedForPromoted) return false;
    }
    // Archived products are excluded unless asked for by name — the row is kept
    // so its order history keeps resolving, not to clutter the catalogue.
    if (collection === "products") {
      const wanted = params.publish_state as string | undefined;
      if (wanted ? String(row.publish_state) !== wanted : row.publish_state === "archived") return false;
    }
    if (params.availability) {
      const wantAvailable = params.availability === "available";
      if (Boolean(row.buyer_product_status) !== wantAvailable) return false;
    }
    // A pooled row has no product, so its category lives on `pool_category`.
    if (params.category_id) {
      const own = row.category_id ?? (row.pool_category as { id?: unknown } | undefined)?.id;
      if (String(own ?? "") !== String(params.category_id)) return false;
      return true;
    }
    if (params.transaction_id && String(row.transaction_id) !== String(params.transaction_id)) return false;
    if (params.type && String(row.type) !== String(params.type)) return false;
    if (params.article_category_id && String(row.article_category_id) !== String(params.article_category_id)) {
      return false;
    }
    if (params.server_category_id && String(row.server_category_id) !== String(params.server_category_id)) return false;
    return true;
  };

  return {
    get: vi.fn(async (url: string, config?: { params?: Record<string, unknown> }) => {
      if (url in DOCUMENTS) return envelope(DOCUMENTS[url]);
      if (url in PARAMETERIZED) return envelope(PARAMETERIZED[url](config?.params ?? {}));

      // Uxiolabs endpoints are documents, not CRUD collections.
      if (url === "/v1/uxiolabs/price-list") {
        return paginate(uxiolabsPriceList(config?.params ?? {}), config?.params ?? {});
      }
      if (url === "/v1/uxiolabs/pool-candidates") {
        return paginate(uxiolabsPoolCandidates(config?.params ?? {}), config?.params ?? {});
      }
      if (url === "/v1/uxiolabs/pool-summary") {
        const all = uxiolabsPoolCandidates({ pool_state: "all", availability: "all" });
        return envelope({
          configured_categories: new Set(all.map((row) => row.provider_category)).size,
          total_candidates: all.length,
          pooled_count: all.filter((row) => row.already_pooled).length,
          new_count: all.filter((row) => !row.already_pooled && row.is_new).length,
        });
      }
      if (url === "/v1/uxiolabs/pool-facets") {
        return envelope(uxiolabsPoolFacets());
      }
      if (url === "/v1/uxiolabs/categories") {
        const rows = uxiolabsCategories();
        return envelope(config?.params?.unmapped ? rows.filter((row) => !row.mapped_category_id) : rows);
      }
      if (url === "/v1/uxiolabs/sku-preview") {
        const sku = String(config?.params?.buyer_sku_code ?? "");
        const found = UXIOLABS_PRICE_LIST.find((row) => row.buyer_sku_code === sku);
        const cost = Number(found?.cost ?? 0);
        return envelope({
          buyer_sku_code: sku,
          name: found?.name ?? "",
          cost,
          already_mapped: Boolean(found?.already_mapped),
          suggested_prices: {
            price_modal: cost,
            price_member: Math.ceil(cost * 1.2),
            price_vip: Math.ceil(cost * 1.15),
            price_reseller: Math.ceil(cost * 1.1),
            price_agent: Math.ceil(cost * 1.05),
          },
        });
      }

      // Pricing rules are a plain (non-paginated) collection — answer it whole
      // so `response.data` stays the array the service maps.
      if (url === "/v1/pricing-rules") {
        return envelope(store["pricing-rules"] ?? []);
      }

      const [collection, id] = parsePath(url);
      const rows = store[collection] ?? [];
      if (id) {
        const found = rows.find((row) => String(row.id) === id);
        if (!found) throw new Error(`No ${collection} found for id: ${id}`);
        return envelope(found);
      }
      const params = config?.params ?? {};
      return paginate(rows.filter((row) => matches(collection, row, params)), params);
    }),

    post: vi.fn(async (url: string, body?: unknown) => {
      // Pool actions are commands, not collection writes — answer them before
      // the generic create/update path tries to parse them as one.
      if (url === "/v1/uxiolabs/pool") {
        const codes = ((body as { buyer_sku_codes?: string[] })?.buyer_sku_codes ?? []) as string[];
        return envelope({ pooled: codes.length, skipped: [] });
      }
      if (url === "/v1/supplier-products/bulk/promote") {
        const ids = ((body as { ids?: unknown[] })?.ids ?? []) as unknown[];
        return envelope({ promoted: ids.length, skipped: [] });
      }
      // Margins are stored per plan and read straight back by the Set Profit
      // Margin page, which stays put after saving — the generic create branch
      // below would parse "bulk/profit-margin" as a new row instead.
      if (url === "/v1/supplier-products/bulk/profit-margin") {
        const payload = body as {
          ids?: unknown[];
          margins?: Record<string, number | null>;
          point_percent?: number | null;
          point_flat?: number | null;
        };
        const ids = (payload?.ids ?? []).map(String);
        const rows = store["supplier-products"] ?? [];

        for (const row of rows) {
          if (!ids.includes(String(row.id))) continue;

          const margins = { ...(payload.margins ?? {}) };
          const kept = ((row.plan_margins ?? []) as { membership_plan_id: number; margin_percent: number }[]).filter(
            (margin) => !(String(margin.membership_plan_id) in margins),
          );
          const written = Object.entries(margins)
            .filter(([, percent]) => percent !== null && percent !== undefined)
            .map(([planId, percent]) => ({ membership_plan_id: Number(planId), margin_percent: Number(percent) }));

          row.plan_margins = [...kept, ...written];
          if ("point_percent" in payload) row.point_percent = payload.point_percent ?? null;
          if ("point_flat" in payload) row.point_flat = payload.point_flat ?? null;
        }

        return envelope({ updated: ids.length });
      }
      if (url === "/v1/supplier-products/bulk/publish") {
        const ids = ((body as { ids?: unknown[] })?.ids ?? []) as unknown[];
        return envelope({ published: ids.length, skipped: [] });
      }
      if (/^\/v1\/supplier-products\/\d+\/(promote|publish)$/.test(url)) {
        return envelope(null);
      }

      const [collection, id] = parsePath(url);
      const rows = store[collection] ?? (store[collection] = []);
      const payload = readForm(body);

      // A POST carrying _method=PUT is an update spoof, not a create.
      if (id) {
        const index = rows.findIndex((row) => String(row.id) === id);
        if (index === -1) throw new Error(`No ${collection} found for id: ${id}`);
        rows[index] = { ...rows[index], ...payload };
        return envelope(rows[index]);
      }

      const created = { ...payload, id: (nextId += 1), created_at: "2026-07-01", updated_at: "2026-07-01" };
      rows.unshift(created);
      return envelope(created);
    }),

    put: vi.fn(async (url: string, body?: unknown) => {
      const [collection, id] = parsePath(url);
      const rows = store[collection] ?? [];
      const index = rows.findIndex((row) => String(row.id) === id);
      if (index === -1) throw new Error(`No ${collection} found for id: ${id}`);
      rows[index] = { ...rows[index], ...readForm(body) };
      return envelope(rows[index]);
    }),

    delete: vi.fn(async (url: string) => {
      const [collection, id] = parsePath(url);
      const rows = store[collection] ?? [];
      const index = rows.findIndex((row) => String(row.id) === id);
      if (index === -1) throw new Error(`No ${collection} found for id: ${id}`);
      rows.splice(index, 1);
      return envelope(null);
    }),

    __store: store,
  };
}
