# 2026-10-08 — Review dialog field readiness + numeric-only inputs

**Scope:** products (Add Products review dialog; add/edit product forms)
**Type:** feat
**Author/agent:** you

## What changed

- **Per-field readiness in the review dialog.** Every row now carries a status
  icon: a green check when the field is filled, an amber warning triangle when a
  required field was left empty, and a muted dash when an optional field was
  (legitimately) left blank. The status is computed in `reviewProducts.ts`
  (`ReviewItem.fields`), so the dialog stays presentational and consistent with
  the block/warn rules that already gate the confirm button.
- **The dialog is grouped into the form's four steps** — Product Data, Pricing &
  Margin, Price Limits, Product Mix — instead of three ad-hoc sections. Price
  Limits moved out of "Product data" into its own section, and the section
  titles reuse the form's own step keys (`stepData`/`stepPricing`/`stepLimits`/
  `stepMix`) so the review and the form can never drift.
- **Pricing deduplicated.** The section used to show the margin-simulation card
  *and* a second per-plan list of the same prices. The per-plan rows are gone;
  the card now carries the margin source per plan as a `hint` ("Custom margin
  (20%)" / "Follows the pricing rule (20%)" / "No margin — sells at cost") and a
  status icon in its header.
- **Numeric fields accept digits only.** New `src/lib/numericInput.ts`
  (`digitsOnly`, `decimalOnly`) is wired into every numeric input's `onChange`,
  so letters never reach form state — typed or pasted. Applied on the Add
  Products page (points, bonus points, discount value, price limits, margin %,
  mix quantity), the manual Add/Edit dialog (same fields), Set Price Limit, Set
  Profit Margin (Bulk), and the Product Mix builder — a shared
  `numericRegister` wraps react-hook-form's `register` for the two RHF forms.

## Why

- The review dialog showed a single per-product badge (`Ready` / `Needs check` /
  `Incomplete`) but nothing per field, so an admin could not see *which* value
  was missing. Distinguishing required blanks (a real problem) from optional
  blanks (fine to skip) was the point — the previous all-or-nothing badge made
  every empty optional field look like a defect.
- The review is the last look before publishing, so it should mirror the form the
  admin just filled — same sections, same order — rather than its own grouping.
- `type="number"` still accepts `e`, `+`, `-` and, in the Tambah Produk page, the
  fields were plain text with only `inputMode="numeric"` — letters went straight
  into state. Sanitising at the `onChange` boundary fixes it for typing and
  paste alike.

## Files touched

- `src/lib/numericInput.ts` (new) — `digitsOnly`, `decimalOnly`, and their test
- `src/features/products/lib/numericRegister.ts` (new) — sanitising `register`
- `src/features/products/lib/reviewProducts.ts` — `ReviewFieldStatus(es)`,
  `ReviewItem.fields`
- `src/features/products/lib/reviewProducts.test.ts` (new)
- `src/features/products/components/ReviewStatusIcon.tsx` (new)
- `src/features/products/components/AddProductsReviewDialog.tsx` — status icons,
  four sections, pricing dedupe
- `src/features/products/components/MarginSimulationCard.tsx` — row `hint`,
  card `status`
- `src/features/products/pages/AddProductsPage.tsx` — numeric sanitising
- `src/features/products/components/MainProductFormDialog.tsx` — numeric
  sanitising
- `src/features/products/components/ProductMixBuilder.tsx` — quantity sanitising
- `src/features/products/components/PoolCandidateFilters.tsx` — uses `digitsOnly`
- `src/features/products/pages/MainProductPriceLimitPage.tsx`,
  `src/features/products/pages/ProviderMarginBulkPage.tsx` — `type="number"`
  inputs become digit/decimal-only text inputs
- `src/locales/{id,en}/products.json` — `reviewFieldFilled/Required/Optional`;
  dropped the now-unused `reviewSectionData/Pricing/Mix`
- `src/features/products/tests/AddProductsPage.test.tsx` — numeric rejection,
  review sections, per-field statuses
- `src/features/products/tests/ProviderMarginBulkPage.test.tsx` — the numeric
  prefills now read back as strings (the inputs are text, not `type="number"`);
  the assertions are otherwise unchanged

## Verification

- [x] Built TDD-first: test cases defined, failing tests written, then implemented to green
- [x] `npm run test` — 683 tests, 105 files, all green
- [x] `tsc -b --force` clean
- [x] `npm run lint` clean (0 errors; 13 pre-existing warnings, none in the touched files)
- [ ] Renders in **both** light and dark — needs a browser check
- [ ] Reconciled against Figma frame — no frame for the dialog

## Notes / follow-ups

- Two `ProviderMarginBulkPage` tests were updated from numeric to string
  `toHaveValue` expectations. That is not a loosened assertion: the field's DOM
  type changed from `number` to `text` (digit/decimal-only), and the expected
  value is identical.
- Numeric sanitising is defence-in-depth for the UI; `productForm.schema.ts`
  (zod) and the API remain the real validation, unchanged.
- The `mix` field reads "optional" in Bulk mode by design (mix is Single-only and
  stripped there), and "missing" in Single when a mix row has no product picked.
