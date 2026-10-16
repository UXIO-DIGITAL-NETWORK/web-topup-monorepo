# 2026-10-16 — Sidebar follows the new Figma

**Scope:** dashboard sidebar (nav, header/search styling, subscription footer card)
**Type:** style
**Author/agent:** you

## What changed
- Nav groups reordered to General → Orders → Products & Services → Content & Marketing → Administrator; "Website Settings" moved into General.
- Labels: Settings → "Website Settings", Users → "User Management", Promo → "Voucher", Marketing → "Content & Marketing", Administration → "Administrator" (en + id).
- Icons swapped to the Figma set (lucide equivalents).
- Header/search/group-label/item styling aligned (sentence-case labels, foreground item text, `⌘ F` kbd).
- Footer card rebuilt: service name, one coloured status line, full-width "Go Check" button. Service list and Detail dialog removed.

## Why
- Figma node `23678:86883` (UDN Admin Dashboard) is the new sidebar. Refunds, Feedback, Pricing Rules and Pages are kept though Figma omits them, so their pages stay reachable. Admin Management and Activity Log are skipped — no routes yet.
- Logo stays `bg-primary` (monochrome rule) instead of Figma's blue.

## Files touched
- `src/features/dashboard/data/nav-groups.data.ts`
- `src/features/dashboard/components/DashboardSidebar.tsx`
- `src/features/dashboard/components/WebsiteSubscriptionCard.tsx`
- `src/locales/{en,id}/dashboard.json`
- `src/features/dashboard/tests/{WebsiteSubscriptionCard.test.tsx,nav-groups.data.test.ts,NavbarControls.test.tsx}`

## Verification
- [x] Built TDD-first: test cases defined, failing tests written, then implemented to green
- [x] `npm run test` passes (673)
- [x] `tsc -b --force` clean
- [x] eslint clean on `src/features/dashboard` (1 pre-existing warning in DataTable)
- [ ] `/qa-audit` run
- [ ] Renders in **both** light and dark (not checked in browser)
- [x] Reconciled against Figma frame (node id: 23678:86883)

## Notes / follow-ups
- Collapsed-rail look of the new card is untested visually.
