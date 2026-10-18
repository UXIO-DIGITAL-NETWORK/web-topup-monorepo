# 2026-10-16 — Transactions table empty state

**Scope:** transactions list (Automatic + Manual pages) — `TransactionsTable`
**Type:** feat
**Author/agent:** Claude

## What changed
- Empty table now renders the shadcn `Empty` block (icon, title, description) instead of a plain text row.
- With active filters it shows "No matching transactions" plus a **Clear filters** action; without filters, "No transactions yet" and no action.
- `TransactionsTable`'s unused `emptyMessage` prop replaced by `onResetFilters`; both pages pass it only when `filters` has a value.
- EN/ID copy added to the `transactions` namespace.

## Why
- The old row said only "No transactions found." with no hint or way out; the Automatic page defaults to today's date, so an empty result is common.
- No illustration: the admin has none for empty states (only the 404/503 SVGs), so an icon is used. Swap in an SVG inside `TransactionsTable` if one is supplied.

## Files touched
- `src/features/transactions/components/TransactionsTable.tsx`
- `src/features/transactions/components/TransactionsTable.test.tsx` (new)
- `src/features/transactions/pages/AutomaticTransactionsPage.tsx`
- `src/features/transactions/pages/ManualTransactionsPage.tsx`
- `src/locales/{en,id}/transactions.json`

## Verification
- [x] Tests written for the empty state (added after the implementation, not before — deviates from TDD-first)
- [x] `vitest run src/features/transactions` passes
- [x] `tsc -b --force` clean
- [x] eslint on `src/features/transactions`: 0 errors, 2 `react-hooks/incompatible-library` warnings from `useReactTable` (pre-existing)
- [ ] `/qa-audit` run
- [ ] Renders in **both** light and dark (not checked in browser)
- [ ] Reconciled against Figma

## Notes / follow-ups
- Optional: illustration asset for empty states.
