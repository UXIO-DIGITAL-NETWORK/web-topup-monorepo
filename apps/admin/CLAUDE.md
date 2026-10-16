# CLAUDE.md — UDN Admin Dashboard

Master brief for Claude Code in this repo. It points at the deeper specs; it does **not** duplicate them.

## What this is

An internal back-office SPA to manage the UDN multi-game top-up platform. **Monochrome** (shadcn `neutral`), **Inter** everywhere, **light + dark (dark default)**. Stack: **React 19 + Vite + TypeScript (strict) + Tailwind v4 (`@theme`, no config file) + shadcn/ui (`new-york`) + TanStack Router/Query/Table + Zustand + React Hook Form + Zod + Axios + recharts + sonner + next-themes**. Testing: **Vitest + React Testing Library**, TDD-first.

## Authoritative documents (read before any task)

Precedence when they conflict:

1. `.agents/context/system_architecture.md` — **how** we build (highest precedence)
2. `.agents/context/product_requirements.md` — **what** we build (scope/content)
3. `.agents/context/design_system.md` — the **look** (tokens, components)
4. this `CLAUDE.md` — operating rules that tie it together

## Project reality (important)

- **Backend is live — the UI-first phase is over.** Every one of the 25 services under
  `features/*/services/` calls the real API through `@/lib/axios`; there is no mock-swap seam
  left to flip. `system_architecture.md §6` and `product_requirements.md §0` still describe
  that phase in the past tense — read them for the *service-interface* shape, not for
  "the API does not exist yet".
- **The feature set is built, not a roadmap.** All 16 slices ship with routes:
  `activity`, `administration`, `auth`, `categories`, `content`, `dashboard`, `feedback`,
  `financial`, `home`, `integration`, `marketing`, `membership`, `pricing`, `products`,
  `refunds`, `reports`, `transactions`. Treat `product_requirements.md §5`'s MVP ordering as history.
- **`dashboard` is real** — `dashboard.service.ts` reads `/v1/dashboard/stats` and
  `/v1/dashboard/performance`. The files left in `features/*/data/` are **no longer the
  service backing**: they are either static select-option lists (`select-options.data.ts`,
  imported by `products.service.ts`) or fixtures now consumed only by the colocated
  `tests/`. Do not wire a screen to them.
- **Transaction status is two statuses.** The API splits the gateway's verdict from the
  supplier's: `payment_status` (`GatewayStatus`, narrower than the order status — a payment
  is never "processing") and `provider_status` (`ProviderStatus`, eight states). The table
  shows them as two labelled columns, **Payment** and **Provider**; `invoice_status` is the
  combined order lifecycle and stays in the edit form and the detail dialog. Both new fields
  are optional in `TransactionApiRow` with a fallback to the old shape, because the three
  repos deploy independently — do not make them required.
- **Refunds are a queue, not a button.** `POST /v1/transactions/{id}/refund` no longer
  fires a gateway refund: a registered member is credited to their balance inline, and a
  guest is queued on `/admin/refunds` for a manual bank transfer. Two consequences for
  anything touching transaction status: the local `refunded` status now asserts that money
  actually left, so it is filterable but **not settable** (`EDITABLE_INVOICE_STATUS_OPTIONS`,
  and the API 422s it on `manual-review`); and the payout bank list is fetched from
  `GET /v1/payout-banks` rather than bundled, so it cannot drift from what the API accepts.
- **`src/index.css` is already retuned** — the greys are true neutral (every one is
  `oklch(L 0 0)`, chroma zero, no blue tint) and `--success`/`--success-foreground` ship in
  both themes. Non-zero chroma is confined to `--success`, `--destructive` and `--chart-*`,
  which are meant to carry colour. **Style by token _name_** so a future retune stays a
  one-file change.
- **Only role = `super-admin`** (all permissions = `["*"]`), but build the `<Can>` / `useCan` / `requirePermission` scaffold now.
- **Admin is bilingual (ID/EN), default Indonesian, and fully extracted.** Every user-facing
  string lives in `src/locales/{id,en}/` — one namespace per feature slice plus `common` and
  `navbar`. `src/config/i18n.ts` registers them; adding one is three edits there (imports, both
  `resources` maps, the `ns` array) and the third is the one people forget.
- **`src/hooks/useLocale.ts` is the ONE place the language changes.** It writes i18next (what is
  on screen), `localStorage` (what the next cold load starts in) and `users.locale` via
  `PATCH /v1/me/locale` (what follows an admin to another device, and what the API's `SetLocale`
  middleware reads). Deliberately **no locale segment in the URL**, unlike the storefront.
- **Anything rendered from a module constant carries a key, not a sentence.** Column arrays become
  `xColumnsFor(t)`; option and tab lists carry `labelKey` and resolve through `translateOptions`
  (`src/lib/i18nOptions.ts`). A `label: "Foo"` at module scope freezes whichever language was
  loaded at import and never updates — that is the trap this convention exists for. **A
  `useMemo`/`useCallback` that calls `t` must list `t` in its deps**, or React Compiler flags a
  stale memo; it did, 32 times, during the extraction.
- **HTML entities do not survive `t()`.** JSX renders `&quot;` as a quote; a catalogue string does
  not — write the real character in the JSON.
- **`src/test/setup.ts` pins the harness to `en`**, and `makeUser`'s `locale` must match it:
  `useLocale` adopts the account's language on mount, so a mismatched fixture flips every rendered
  screen out from under the assertions.
- Left untranslated on purpose: brand and vendor names (Uxiolabs, Moonton API), fixture data under
  `features/*/data/` and `src/test/`, status sentinels (`?? "PENDING"`), numeric placeholder
  examples, and zod schema messages — a schema is built at module scope with no `t` in reach.
- **Every feature is built TDD-first:** test cases → failing tests → implementation to green (`system_architecture.md §4.11`). No exceptions, not a per-feature decision.

## Workflow (non-negotiable)

**Plan -> Approve -> Build.**

1. `/plan-feature` — @pm reads the context docs, writes **`PLAN.md`** (whole-scope), lists open decisions with recommended defaults, then **STOPS for your approval**. No implementation code in this stage.
2. `/build-feature <feature>` — @frontend + @api build **one** feature/screen **test-first** (write the test cases, write the failing tests, then implement until green — `system_architecture.md §4.11`), QA it, commit — then **STOP for approval** before the next. Planning is whole-scope; execution is per-feature.
3. Never invent business rules. Finance settlement/fees are deliberately **TBD** — surface them, don't guess. When unsure about design/architecture, present 2 options with a recommended default.

## Where things live

- `.agents/` — portable, agent-agnostic spec: `context/` (the 3 docs), `roles/` (pm, frontend, api_integrator, qa), `rules/`, `workflows/`, `skills/`, `agents.md` (roster/index).
- `.claude/` — Claude Code native layer: `agents/` (subagents), `agent-memory/` (per-agent MEMORY.md — read before, update after), `commands/`, `rules/` (always-on enforcement mirrors), `skills/` (incl. vendored **impeccable**), `output-styles/custom-components.md`, `hooks/format.sh`, `settings.json`.
- `src/` (per `system_architecture.md §3`): `features/*` (the app — isolated slices), `components/{ui,common,layouts}`, `routes/` (registry-only), `middlewares/authMiddleware.ts`, `store/`, `lib/{axios,react-query,utils}`, `types/{api.type,models}`, `config/env.ts`, `utils/`, `test/` (Vitest harness — `setup.ts`, `test-utils.tsx`), `index.css`. `routeTree.gen.ts` is generated — never hand-edit.

## Branding

This panel belongs to the CLIENT, not to kita. `src/hooks/useBranding.ts` reads
`site_name` from the public `/v1/storefront/settings` (unauthenticated, so the
login screen is branded too) and the sidebar wordmark render it — never a hardcoded
"Uxiolabs". One deployment says "TopupGame by Uxiolabs", the next says whatever it is
called. The fallback is a real name rather than a blank, because a header that
flickers empty on every cold load looks broken.

## Rilis & changelog

`src/features/changelog/data/changelog.data.ts` adalah satu-satunya tempat catatan rilis ditulis, dan `/admin/changelog` menampilkannya dalam dua tab: **Fitur** (yang admin lihat dan pakai) dan **Teknis** (modul yang tersentuh, untuk developer). Keduanya dari satu berkas supaya tidak mungkin bercerita beda soal rilis yang sama.

- **Entri ditulis di commit yang membuat perubahannya**, bukan menumpuk di akhir. Catatan yang ditulis belakangan selalu kehilangan hal yang paling mudah dilupakan.
- **`changes` ditulis tanpa nama modul, path berkas, atau istilah teknis.** Kalau pembacanya harus tahu kode untuk mengerti, kalimatnya salah — detail itu tempatnya di `technical`.
- **`changes` boleh kosong** untuk rilis yang memang tidak terlihat admin (mis. hanya pekerjaan deploy); halaman mengatakannya terus terang. Mengarang pembaruan supaya daftarnya kelihatan berisi justru lebih buruk.
- **Hanya rilis stabil.** Tag `-rc` tidak masuk: yang dibaca admin adalah apa yang benar-benar sudah naik ke produksi.
- **Terbaru di atas**, dan `version` ditulis sama persis dengan tag (`"v1.4.9"`) — nilainya dicocokkan dengan `APP_VERSION` untuk menandai versi yang sedang berjalan.

`deploy-prod.yml` memperingatkan bila tag yang dirilis tidak ada di berkas itu. Peringatan, bukan gerbang: kelalaian dokumentasi tidak boleh menahan rilis perbaikan darurat.

Halaman ini **hanya ada di panel admin**, dan isinya ikut bundle saat build — tidak ada endpoint, tabel, atau CRUD. Kalau suatu saat storefront butuh changelog untuk pelanggan, itu fitur terpisah: bahasanya berbeda dan sumbernya harus pindah ke API.

## Commands

| Command                       | Does                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `/plan-feature [focus]`       | Whole-scope plan -> `PLAN.md`, then STOP for approval                       |
| `/build-feature <feature>`    | Build one feature TDD-first (tests before code), QA, then STOP for approval |
| `/qa-audit [feature\|global]` | Definition of Done -> `.artifacts/qa-log.md`                                |
| `/add-shadcn <component>`     | Add a shadcn primitive, restyle with neutral tokens                         |
| `/commit [scope]`             | One Conventional Commit + its log entry                                     |
| `/typecheck`                  | `tsc -b --force` + `eslint`, summarized                                       |
| `/log-change <slug>`          | Append a `logs/feature-changes/` entry                                      |
| `/update-memory <agent>`      | Refresh an agent's `MEMORY.md`                                              |
| `/impeccable <mode> [target]` | Production-grade UI craft/critique (run `/impeccable init` first use)       |

## Subagents (keep the main context clean)

`frontend-engineer` (screens/components), `api-integrator` (typed data layer + mock-swap seam), `qa-auditor` (read-only Definition of Done). Each reads its `.claude/agent-memory/<agent>/MEMORY.md` first and updates it after. Output styles don't reach subagents, so the custom-primitive rules are also in `.claude/rules/custom-components.md`.

## Always-on rules (`.claude/rules/`)

`project`, `react-typescript`, `tailwind-styling`, `custom-components`, `feature-isolation`, `rbac-security`, `accessibility`, `logging`, `memory-context`, `commit`, `testing-strategy`. Digest:

- **Feature isolation** — no cross-feature imports; promote shared code up.
- **Custom primitives only** in feature TSX (`Box`/`Container`/`Text`/`Heading`/`Link`/`Image`); interactive controls -> shadcn/ui.
- **Tokens only** — no raw hex / palette classes; monochrome; color only via `text-success`/`text-destructive`/`chart-*`; numbers use `tabular-nums`.
- **Routing is registry-only**; guards (`requireAuth`/`requirePermission`) in `beforeLoad`, never in components.
- **Server data via TanStack Query only**; global client state via Zustand; mocks behind the service boundary.
- **TDD, always:** test cases → failing tests → implementation to green. Colocated `*.test.tsx`, Vitest + React Testing Library. Never loosen/delete a test to pass it.
- TS strict, no `any`. Green (`tsc` + `lint` + `test`) before commit. Never `Read`/commit `.env*`.

## MCP (`.mcp.json`)

`context7` (live TanStack/Tailwind v4/shadcn/Zod docs), `shadcn` (browse/install primitives), `chrome-devtools` (QA screenshots/console/perf), `figma` (pull frames/tokens from file `l7izBcDr0PtS2FUdMdHFk3` — Dashboard node `22011-2008`, components `22078-1614`).

## Hooks / formatting

A `PostToolUse` hook (`.claude/hooks/format.sh`) prettier-formats every `Edit`/`Write` on `.ts/.tsx/.css/.json`.

## Image uploads

`ImageDropzone` re-encodes every picked image to WebP (`src/lib/imageCompression.ts`: quality 0.82, longest
edge 1920px, EXIF rotation baked in) before the form ever sees the `File`. Three consequences worth knowing:

- **Any zod schema validating an image must accept `image/webp`** — otherwise it rejects the browser's own
  optimised output. It also means a size limit is checked against the compressed file, not the camera original.
- **`compressImage` never throws.** SVG/ICO/PDF, animated GIFs, already-small WebP, a browser without WebP
  encoding, and a result that came out bigger all return the input file untouched.
- **Payment proof is not compressed** (`EditTransactionForm`) — proof is evidence and is uploaded exactly as
  submitted. The API excludes those endpoints from conversion for the same reason.

The API converts everything it receives anyway (`App\Services\ImageOptimizer`); this is the shortcut, not the
guarantee.

## Definition of Done

See `system_architecture.md §9` and `.agents/workflows/qa.md`. A feature is done only when it's built **TDD-first** with `npm run test` passing, isolated, tokens-only, both-theme correct, Figma-reconciled, type/lint-clean, `<Can>`-gated where privileged, tables have loading/empty/error states, and it carries a `logs/feature-changes/` entry.
