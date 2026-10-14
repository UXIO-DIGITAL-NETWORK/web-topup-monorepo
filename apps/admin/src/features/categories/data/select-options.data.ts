import type { SelectOption, SelectOptionKey } from "../types/category.type";

export const CATEGORY_TYPE_OPTIONS: SelectOptionKey[] = [
  { value: "Mobile Game", labelKey: "optMobileGame" },
  { value: "PC Game", labelKey: "optPcGame" },
  { value: "Voucher", labelKey: "colVoucher" },
];

/**
 * Category Provider's `Provider` select (§4.5 line 247). Mirrors the supplier
 * names in `features/financial/data/suppliers.data.ts` and the `type:
 * "supplier"` entries of `features/integration/data/channels.data.ts` — copied
 * rather than imported, because features must not reach across each other and
 * `integration.type.ts` states the overlap is deliberately not a shared type.
 */
// Brand names, so these carry a label rather than a key — there is nothing to
// translate.
export const PROVIDER_OPTIONS: SelectOption[] = [
  { value: "Uxiotopup", label: "Uxiotopup" },
  { value: "Zelpoint", label: "Zelpoint" },
  { value: "Topupkuy", label: "Topupkuy" },
];

export const META_ROBOTS_OPTIONS: SelectOptionKey[] = [
  { value: "Index, Follow", labelKey: "optIndexFollow" },
  { value: "No Index, No Follow", labelKey: "optNoIndexNoFollow" },
  { value: "Index, No Follow", labelKey: "optIndexNoFollow" },
  { value: "No Index, Follow", labelKey: "optNoIndexFollow" },
];
