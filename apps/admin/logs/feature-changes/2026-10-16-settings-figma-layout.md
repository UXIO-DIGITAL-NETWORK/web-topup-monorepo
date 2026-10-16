# 2026-10-16 — Website Settings layout per Figma

**Scope:** `/admin/settings` (administration → SettingsPage), all tabs
**Type:** style
**Author/agent:** you

## What changed
- Dropped the page-level "Settings" card and the bottom "Save Settings" button.
- Each tab now opens with a header card (group title + help text) carrying **Edit**, or **Cancel / Save** while editing.
- Boolean settings render as their own card (title + description left, Switch right); other fields share one card.
- Save opens a "Save Data?" AlertDialog; the write only fires on "Yes, Save", then leaves edit mode. Cancel discards unsaved edits.
- Licence tab keeps the header but has no Edit (read-only).
- Tabs follow a fixed order (General, Contact, Operational, Payment, Points, SEO, Social, Licence); SEO and Social cards get long titles ("Search Engine Optimization (SEO)", "Social Profile Link").
- Operational expiry rows stack label over a full-width input.
- New shared `EmptyState` (illustration, title, description, optional action) used by the unconfigured Licence tab (with "Check again") and the `DataTable` empty row (`emptyAction` prop).

## Why
- Figma section "General" (node `23678:86881`, frames Default / Edit / Modal Confirmation). Decisions: fields are **not** locked outside edit mode; layout applies to every tab since the page is one generic renderer.

## Files touched
- `src/features/administration/pages/SettingsPage.tsx`, `components/{JsonNumberMapField,LicencePanel}.tsx`
- `src/components/common/{EmptyState,EmptyState.test,DataTable}.tsx`, `public/illustrations/empty.svg`, `src/test/fakeApi.ts`
- `src/locales/{en,id}/administration.json` (`settingsSubtitle` replaced by edit/cancel/save + confirm copy)
- `src/features/administration/tests/administration-routes.test.tsx`

## Verification
- [x] Built TDD-first: test cases defined, failing tests written, then implemented to green
- [x] `npm run test` passes (676)
- [x] `tsc -b --force` clean
- [x] `eslint src/features/administration` clean
- [ ] `/qa-audit` run
- [ ] Renders in **both** light and dark
- [ ] Reconciled against Figma frame — only via REST screenshots; Figma MCP had no access and REST hit its rate limit

## Notes / follow-ups
- `settingsTitle` locale key is now unused.
- Figma shows the Public badge nowhere; kept because it is tested and tells admins what reaches the storefront.
