# 2026-10-19 — Refunds moved into Transactions tabs

**Scope:** transactions layout, refunds page, sidebar
**Type:** feat
**Author/agent:** @frontend

## What changed
- Transactions tab strip now has one full-width bottom border; the active tab's underline sits on it.
- Refunds is a tab of Transactions (`/admin/transactions/refunds`), placed after Manual. The standalone sidebar item is gone; the old `/admin/refunds` URL redirects to the tab.
- Refunds table shows a shadcn `Empty` state when there is no data, with a "Clear filters" action when filters caused it. Rest of the page is unchanged.
- Tabs are fit-content (triggers `flex-none`); the bottom border still spans the full width.
- Invoice Log left the tab strip for its own sidebar entry (`/admin/invoice-log`, Orders group); the old `/admin/transactions/invoice-log` URL redirects.
- Brought in the transactions-table empty state from PR #24 (cherry-picked) so this branch shows it too.
- `DataTable` gained an optional `emptyState` node (falls back to `emptyMessage` as before).

## Why
- Refunds are an order-lifecycle concern and belong beside transactions, as in the Figma.
- Same empty-state pattern as the transactions table (PR #24) keeps the admin consistent.

## Files touched
- `src/features/transactions/layouts/TransactionsLayout.tsx`
- `src/routes/admin/_protected/invoice-log/index.tsx` (new), `src/routes/admin/_protected/transactions/invoice-log/index.tsx` (redirect)
- `src/routes/admin/_protected/transactions/refunds/index.tsx` (new), `src/routes/admin/_protected/refunds/index.tsx` (redirect), `src/routeTree.gen.ts` (regenerated)
- `src/features/dashboard/data/nav-groups.data.ts`, `src/features/dashboard/components/DashboardNavbar.tsx` (breadcrumb tab key)
- `src/features/refunds/pages/RefundsPage.tsx`, `src/components/common/DataTable.tsx`
- `src/locales/{en,id}/{transactions,refunds,dashboard}.json`
- tests: `RefundsPage.test.tsx`, `transactions-routes.test.tsx`, `NavbarControls.test.tsx`; doc line in `CLAUDE.md`

## Verification
- [x] Built TDD-first: new tests failed first, then green
- [x] `vitest run` passes (715 tests)
- [x] `tsc -b --force` clean
- [x] eslint: no errors on touched dirs
- [ ] `/qa-audit` run
- [ ] Renders in **both** light and dark
- [ ] Reconciled against Figma frame

## Notes / follow-ups
- Tab order is Automatic · Manual · Refunds. `tabInvoiceLog` locale key was replaced by `navInvoiceLog` in `dashboard.json`.
- The old `refunds` empty-state key (`empty`) and `navRefunds` locale key were removed as unused.
