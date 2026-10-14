import type { KeyedSelectOption, PriceRangeOption, SelectOption } from "../types/product.type";

/**
 * Sub Category options per category — the Add form's Sub Category select lists
 * only the chosen category's entries, matching `SubCategory.category_id` in §6.
 *
 * **Inferred, not confirmed** (§4.6): the reference never opens this select.
 * These are the currencies/passes each game actually sells; revise when the
 * API (or a Sub Category service) lands.
 */
export const SUB_CATEGORY_OPTIONS: Record<string, SelectOption[]> = {
  "Mobile Legends: Indonesia": [
    { value: "Diamonds", label: "Diamonds" },
    { value: "Weekly Pass", label: "Weekly Pass" },
    { value: "Starlight", label: "Starlight" },
  ],
  "Free Fire Indonesia": [
    { value: "Diamonds", label: "Diamonds" },
    { value: "Membership", label: "Membership" },
  ],
  "Genshin Impact": [
    { value: "Genesis Crystals", label: "Genesis Crystals" },
    { value: "Welkin Moon", label: "Welkin Moon" },
  ],
  "PUBG Mobile": [
    { value: "Unknown Cash", label: "Unknown Cash" },
    { value: "Royale Pass", label: "Royale Pass" },
  ],
  Valorant: [{ value: "Valorant Points", label: "Valorant Points" }],
  "Honkai: Star Rail": [
    { value: "Oneiric Shards", label: "Oneiric Shards" },
    { value: "Express Supply Pass", label: "Express Supply Pass" },
  ],
};

/**
 * The Add form's two remaining selects. **Inferred, not confirmed** (§4.6):
 * the reference shows only their placeholders, never their lists.
 */
export const PRODUCT_TAG_OPTIONS: KeyedSelectOption[] = [
  { value: "popular", labelKey: "optPopular" },
  { value: "new", labelKey: "newBadge" },
  { value: "promo", labelKey: "optPromo" },
  { value: "best-seller", labelKey: "optBestSeller" },
];

/** Same upstream validators the Category form offers (§4.5) — one product's
 * nickname check is the same integration its category uses. */
// Vendor names, so these carry labels rather than keys — including "None",
// which reads as one more choice in a list of integrations.
export const NICKNAME_VALIDATION_OPTIONS: SelectOption[] = [
  { value: "Moonton API", label: "Moonton API" },
  { value: "Garena API", label: "Garena API" },
  { value: "miHoYo API", label: "miHoYo API" },
  { value: "Riot API", label: "Riot API" },
  { value: "None", label: "None" },
];

/**
 * Sources the Add form's Product Mix rows — the upstream SKUs a bundled
 * product is assembled from.
 *
 * **Inferred, not confirmed** (§4.6): the frame shows the section's empty
 * state only, and no supplier fixture exists yet — the Product Provider tab is
 * still a placeholder. Labelled `supplier — SKU` so a row reads on its own.
 * Replace wholesale once a Product Provider service lands.
 */
// Supplier SKU placeholders, not UI copy.
export const SUPPLIER_PRODUCT_OPTIONS: SelectOption[] = [
  { value: "uxiolabs-ml-86", label: "Uxiotopup — ML 86 Diamond" },
  { value: "uxiolabs-ml-172", label: "Uxiotopup — ML 172 Diamond" },
  { value: "unipin-ff-70", label: "UniPin — FF 70 Diamond" },
  { value: "unipin-genshin-60", label: "UniPin — Genesis Crystal 60" },
  { value: "codashop-pubgm-60", label: "Codashop — PUBGM 60 UC" },
];

/**
 * Sources the toolbar's "All Price" select.
 *
 * **Inferred, not confirmed** (§4.6): the reference shows only the trigger's
 * "All Price" label and never opens the list, so the options are not visible.
 * "All Price" reads as the clear-all value of a price filter, so this is
 * modelled as ranges. `max` is exclusive; the last bucket is open-ended.
 * Revise when a reference or the API shows what this actually filters.
 */
export const PRICE_RANGE_OPTIONS: PriceRangeOption[] = [
  { value: "under-10k", labelKey: "optUnder10k", min: 0, max: 10_000 },
  { value: "10k-50k", labelKey: "opt10kTo50k", min: 10_000, max: 50_000 },
  { value: "50k-100k", labelKey: "opt50kTo100k", min: 50_000, max: 100_000 },
  { value: "over-100k", labelKey: "optOver100k", min: 100_000 },
];
