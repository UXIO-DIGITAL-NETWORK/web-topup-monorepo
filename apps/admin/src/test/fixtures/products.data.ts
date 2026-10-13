import type { Product, ProductVariant } from "@/features/products/types/product.type";

/**
 * Typed mock fixtures for the UI-first phase (system_architecture.md §6).
 * Ids and timestamps are deterministic literals — the contract tests depend on
 * them. Raw ISO timestamps only; the UI formats at render.
 *
 * 12 rows so page 2 exists at the default per_page of 10, and both values of
 * both status axes are represented (the two stacked badges each need a
 * negative case, or half the Status column goes untested).
 *
 * `image_url` is deliberately absent everywhere: no product art ships with
 * this repo, and a broken <img> reads worse than the initials tile the cell
 * falls back to. Real URLs drop in with no code change.
 */

/**
 * Derives a variant's cost and its four tier prices from the retail price, so
 * the fixtures carry plausible margins without 80 hand-typed numbers. The
 * markups reproduce the reference card (cost 58.745 -> public 62.857, VIP
 * 60.801, reseller 60.214, agent 59.332).
 *
 * ponytail: fixture-only pricing math — the real API returns cost and the four
 * prices per variant, so nothing in the UI derives them.
 */
function priced(publicPrice: number): Pick<ProductVariant, "cost_price" | "prices"> {
  const cost = Math.round(publicPrice / 1.07);
  return {
    cost_price: cost,
    prices: {
      public: publicPrice,
      vip: Math.round(cost * 1.035),
      reseller: Math.round(cost * 1.025),
      agent: Math.round(cost * 1.01),
    },
  };
}
/**
 * Lifecycle defaults, spread per row. A published product is one the storefront
 * can actually sell — active AND backed by an active supplier mapping — so a
 * fixture that is merely `status: "active"` is not automatically published.
 */
const LIVE = { publish_state: "published", can_publish: false, publish_blocked_reason: null } as const;
const NOT_LIVE = { publish_state: "draft", can_publish: true, publish_blocked_reason: null } as const;

export const PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name: "Weekly Diamond Pass (One Week)",
    game_id: "game-mlbb",
    game_name: "Mobile Legends: Bang Bang",
    category_name: "Mobile Legends: Indonesia",
    code: "MLBB-WDP-01",
    ...LIVE,
    status: "active",
    is_available: true,
    variants: [
      { id: "prod-1-var-1", name: "Weekly Diamond Pass", ...priced(27788), status: "active" },
      { id: "prod-1-var-2", name: "Twilight Pass", ...priced(149000), status: "active" },
    ],
    created_at: "2026-03-08T17:52:00.000Z",
    updated_at: "2026-03-08T17:52:00.000Z",
  },
  {
    id: "prod-2",
    name: "Diamond Top Up 86",
    game_id: "game-mlbb",
    game_name: "Mobile Legends: Bang Bang",
    category_name: "Mobile Legends: Indonesia",
    code: "MLBB-DM-086",
    ...LIVE,
    status: "active",
    is_available: true,
    // The one row whose price is hidden — the row menu's Show/Hide item follows
    // the row's own state, so both directions need a fixture.
    is_price_hidden: true,
    variants: [{ id: "prod-2-var-1", name: "86 Diamonds", ...priced(21500), status: "active" }],
    created_at: "2026-03-10T21:59:00.000Z",
    updated_at: "2026-03-10T21:59:00.000Z",
  },
  {
    id: "prod-3",
    name: "Diamond Top Up 172",
    game_id: "game-mlbb",
    game_name: "Mobile Legends: Bang Bang",
    category_name: "Mobile Legends: Indonesia",
    code: "MLBB-DM-172",
    ...LIVE,
    status: "active",
    is_available: false,
    variants: [{ id: "prod-3-var-1", name: "172 Diamonds", ...priced(42800), status: "active" }],
    created_at: "2026-03-11T09:14:00.000Z",
    updated_at: "2026-03-12T08:02:00.000Z",
  },
  {
    id: "prod-4",
    name: "Membership Bulanan",
    game_id: "game-ff",
    game_name: "Free Fire",
    category_name: "Free Fire Indonesia",
    code: "FF-MEM-30D",
    ...LIVE,
    status: "active",
    is_available: true,
    variants: [
      { id: "prod-4-var-1", name: "Membership Mingguan", ...priced(29000), status: "active" },
      { id: "prod-4-var-2", name: "Membership Bulanan", ...priced(89000), status: "active" },
    ],
    created_at: "2026-03-12T11:07:00.000Z",
    updated_at: "2026-03-12T11:07:00.000Z",
  },
  {
    id: "prod-5",
    name: "Diamond Top Up 70",
    game_id: "game-ff",
    game_name: "Free Fire",
    category_name: "Free Fire Indonesia",
    code: "FF-DM-070",
    ...LIVE,
    status: "active",
    is_available: true,
    variants: [{ id: "prod-5-var-1", name: "70 Diamonds", ...priced(9500), status: "active" }],
    created_at: "2026-03-13T15:31:00.000Z",
    updated_at: "2026-03-13T15:31:00.000Z",
  },
  {
    id: "prod-6",
    name: "Diamond Top Up 355",
    game_id: "game-ff",
    game_name: "Free Fire",
    category_name: "Free Fire Indonesia",
    code: "FF-DM-355",
    ...NOT_LIVE,
    status: "inactive",
    is_available: false,
    variants: [{ id: "prod-6-var-1", name: "355 Diamonds", ...priced(48000), status: "inactive" }],
    created_at: "2026-03-14T10:22:00.000Z",
    updated_at: "2026-03-20T14:45:00.000Z",
  },
  {
    id: "prod-7",
    name: "Genesis Crystal 60",
    game_id: "game-genshin",
    game_name: "Genshin Impact",
    category_name: "Genshin Impact",
    code: "GI-GC-060",
    // Promoted, but the provider switched the SKU off: publishing it would
    // advertise an order checkout can only fail.
    publish_state: "draft",
    can_publish: false,
    publish_blocked_reason: "SKU sedang nonaktif di provider.",
    status: "inactive",
    is_available: true,
    // The checker's flag on the supplier mapping — separate from `is_available`
    // (the admin's own storefront visibility). This is what the "Inactive at
    // provider" warning and the archive filter read.
    provider_inactive: true,
    variants: [{ id: "prod-7-var-1", name: "60 Genesis Crystals", ...priced(16000), status: "active" }],
    created_at: "2026-03-15T08:45:00.000Z",
    updated_at: "2026-03-15T08:45:00.000Z",
  },
  {
    id: "prod-8",
    name: "Blessing of the Welkin Moon",
    game_id: "game-genshin",
    game_name: "Genshin Impact",
    category_name: "Genshin Impact",
    code: "GI-WELKIN-01",
    // Archived: kept only so its order history keeps resolving.
    publish_state: "archived",
    can_publish: false,
    publish_blocked_reason: "Produk sudah diarsipkan. Pulihkan terlebih dahulu.",
    status: "inactive",
    is_available: true,
    variants: [{ id: "prod-8-var-1", name: "Welkin Moon 30 Hari", ...priced(79000), status: "active" }],
    created_at: "2026-03-16T19:03:00.000Z",
    updated_at: "2026-03-16T19:03:00.000Z",
  },
  {
    id: "prod-9",
    name: "Unknown Cash 60",
    game_id: "game-pubgm",
    game_name: "PUBG Mobile",
    category_name: "PUBG Mobile",
    code: "PUBGM-UC-060",
    ...LIVE,
    status: "active",
    is_available: true,
    variants: [{ id: "prod-9-var-1", name: "60 UC", ...priced(14500), status: "active" }],
    created_at: "2026-03-17T13:18:00.000Z",
    updated_at: "2026-03-17T13:18:00.000Z",
  },
  {
    id: "prod-10",
    name: "Royale Pass Bulanan",
    game_id: "game-pubgm",
    game_name: "PUBG Mobile",
    category_name: "PUBG Mobile",
    code: "PUBGM-RP-30D",
    ...NOT_LIVE,
    status: "inactive",
    is_available: false,
    variants: [
      { id: "prod-10-var-1", name: "Royale Pass Elite", ...priced(155000), status: "inactive" },
      { id: "prod-10-var-2", name: "Royale Pass Elite Plus", ...priced(385000), status: "inactive" },
    ],
    created_at: "2026-03-18T07:56:00.000Z",
    updated_at: "2026-03-21T16:30:00.000Z",
  },
  {
    id: "prod-11",
    name: "Valorant Point 475",
    game_id: "game-valorant",
    game_name: "Valorant",
    category_name: "Valorant",
    code: "VAL-VP-475",
    ...LIVE,
    status: "active",
    is_available: true,
    variants: [{ id: "prod-11-var-1", name: "475 Valorant Points", ...priced(55000), status: "active" }],
    created_at: "2026-03-19T20:40:00.000Z",
    updated_at: "2026-03-19T20:40:00.000Z",
  },
  {
    id: "prod-12",
    name: "Oneiric Shard 60",
    game_id: "game-hsr",
    game_name: "Honkai: Star Rail",
    category_name: "Honkai: Star Rail",
    code: "HSR-OS-060",
    ...LIVE,
    status: "active",
    is_available: true,
    variants: [{ id: "prod-12-var-1", name: "60 Oneiric Shards", ...priced(16000), status: "active" }],
    created_at: "2026-03-20T12:11:00.000Z",
    updated_at: "2026-03-20T12:11:00.000Z",
  },
];
