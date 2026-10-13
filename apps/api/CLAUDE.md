# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
# First-time setup
composer run setup

# Development (runs server + queue worker + pail log viewer + vite concurrently)
composer run dev

# Run all tests (uses in-memory SQLite — no DB setup needed)
composer run test

# Fallback when the sqlite PDO driver is unavailable (`could not find driver`).
# Requires php8.4-sqlite3 normally; this runs the same suite against MySQL
# instead, which also matches production's driver more closely.
#   mysql -e "CREATE DATABASE IF NOT EXISTS web_topup_api_test;"
DB_CONNECTION=mysql DB_DATABASE=web_topup_api_test php artisan test

# Run a single test file or filter
php artisan test tests/Feature/ExampleTest.php
php artisan test --filter=CheckoutTest

# Code style fix (Laravel Pint)
./vendor/bin/pint

# Queue worker (standalone, for production-like local testing)
php artisan queue:listen --tries=3 --timeout=60

# Hub wiring — hub:status prints a live report; hub:ping exits non-zero when
# HUB_ENABLED but the Hub is unreachable (this is the deploy gate).
php artisan hub:status
php artisan hub:ping

# Migrations
php artisan migrate
php artisan migrate:fresh --seed
```

---

## Architecture

### The Mandatory Data Flow

Every request must follow this exact pipeline — no exceptions:

```
Route → FormRequest (validation) → Controller (maps DTO) → Action (business logic) → ApiResponse
```

- **Controllers** are pure routers. They validate, build a DTO, call one Action, and return. No DB calls, no conditionals, no business logic.
- **Actions** own all logic. One Action = one task. They receive a DTO, run inside `DB::transaction()` where state changes are involved, and return a plain array or model.
- **DTOs** are `readonly` PHP 8.2+ value objects. They are the only thing passed between Controller and Action.
- **`ApiResponse` trait** (`app/Traits/ApiResponse.php`) is used in all controllers: `successResponse()`, `errorResponse()`, `validationErrorResponse()`, `paginatedResponse()`. Every paginated `index()` returns `paginatedResponse(XResource::collection($paginator), $message)` so all list endpoints share one shape: `{status, code, message, data: {data, links, meta}}`. `validationErrorResponse()`'s shape (`{status:"fail", code:422, message, errors}`) is also what `bootstrap/app.php`'s `withExceptions()` renders for every `ValidationException` on API routes — don't let a controller's manual 422 drift from it.
- Admin-only middleware: `EnsureUserIsAdmin` (aliased as `admin` in `bootstrap/app.php`) matches the authenticated user's `role()->name` against `App\Enums\RoleType::ADMIN` (case-insensitively) — not a hardcoded `role_id`, since role ids aren't guaranteed stable outside the seeded prod data. Applied to the whole admin-management route group in `routes/api.php`; `GET /v1/user` and `PATCH /v1/users/sync-timezone` stay on plain `auth:sanctum` for any authenticated caller.

### Notable Deviation: CheckoutController

`CheckoutController` validates inline (not via a FormRequest class) because its validation rule for `guest_contact` is dynamic — `required` for guests, `nullable` for authenticated users. This is an intentional exception to the FormRequest convention.

---

## Domain: Checkout & Payment Flow

### Checkout (`POST /v1/checkout`) — public, no auth

1. Duplicate-submit guard: an atomic `Cache::add` fingerprint rejects an identical checkout within 15s; the key is released on failure so a rejected attempt can retry immediately.
2. Resolves User (nullable for guests), Product (with active SupplierProducts eager-loaded, `status` must be true), PaymentChannel.
3. Price is plan-resolved by `App\Support\Pricing\PlanPrice` — see **Membership-plan pricing**. Guests resolve to the default (free) plan.
4. Margin guard: aborts if `selling_price - supplier_price < 0`. The price/margin are frozen into the Transaction row at checkout — a later supplier price change (daily sync) is margin variance, not a correctness bug.
4b. **Daily allowance** (`supplier_products.daily_order_limit`): aborts when the SKU's orders for the current WIB day have reached its ceiling. A LOCAL quota — uxiolabs reports only `aktif`/`nonaktif` and has no availability probe, so there is no provider number to mirror. Checked here so an exhausted SKU fails before the gateway is called, and **again inside the write transaction under `lockForUpdate` on the mapping row**, which is what stops two simultaneous orders taking the same last slot. The count is derived from `transactions` (statuses other than `FAILED_PROVIDER`/`REFUNDED`/`EXPIRED`, since `created_at >= midnight WIB`), never decremented — so a released order frees its slot with no release path to maintain. Storefront rows expose `stock_left` (null = no ceiling, which is NOT the same as 0 = sold out) and `is_sold_out`; see `App\Support\Stock\DailyStockLimit`.
5. Creates `Transaction` (status: `PENDING`) then `Payment` (status: `'1'`) inside a single `DB::transaction()`.
6. **Balance path** (`channel_code === 'balance'`): locks the user row FOR UPDATE, debits through `WalletLedger::record(type: 'purchase')` (not a raw `decrement` — a statement showing a refund credit with no matching debit is worse than no statement), marks Payment `'3'`, calls `ProcessUxiolabsTransactionAction` synchronously.
7. **External path**: calls `MonetapayService::createTransaction()`, returns `qr_string` or `virtual_account` to the client.

Rate limiting (named limiters in `AppServiceProvider`): `throttle:checkout` (10/min) on checkout + postpaid endpoints, `throttle:webhooks` (120/min per IP) on all callback routes, `throttle:login` (5/min per IP), and a global `throttle:api` (120/min) via `bootstrap/app.php`.

### Transaction Status Machine

```
PENDING → PAID → PROCESSING → COMPLETED
        ↘                   ↘ FAILED_PROVIDER → REFUNDED
         EXPIRED
```

- `EXPIRED` — payment window timed out; customer never paid (set by Monetapay callback or `payments:sync-expired`).
- `FAILED_PROVIDER` — customer paid; the uxiolabs supplier failed to fulfil the order (status `cancel`/`refund`).
- `REFUNDED` — the money has gone back. A member's order reaches it immediately (the wallet is credited inline); a guest's stays on `FAILED_PROVIDER` until an admin completes the manual transfer.

**`REFUNDED` is terminal, and every terminal-state guard must list it.** uxiolabs can redeliver `cancel` then `success`; without it a late success flips a refunded order to `COMPLETED` after the customer was already paid back. The two guards are `HandleUxiolabsWebhookAction` and `HandleMonetapayCallbackAction`. `ManualReviewTransactionRequest` deliberately **rejects** `REFUNDED` — the status now asserts that money moved, so only the refund flow may write it — and `AdminRetryTransactionAction` refuses a transaction with a non-`REJECTED` refund, or the customer would get the item *and* their money.

Statuses are backed enums cast on the models: `App\Enums\TransactionStatus` (values are the exact uppercase strings above) and `App\Enums\PaymentStatus`. `$model->status` returns the enum instance — compare against enum cases, never raw strings; JSON output is unchanged (enums serialize to their values).

### The two lifecycles: `provider_status` vs `status`

`transactions.status` answers two questions at once — did the customer pay, and did the supplier deliver — which is why `PROCESSING` cannot tell an operator whether uxiolabs has the order or the queue worker simply has not sent it yet. **`transactions.provider_status` (`App\Enums\ProviderStatus`) owns the supplier's half alone**, so the two can be read and filtered apart. `App\Enums\GatewayStatus` is the matching vocabulary for the payment half — a *projection*, not a column, over `payments.status` (`'1'..'4'`) and `service_invoices.status`, so the union feed and the frontends speak one alphabet.

Three provider states name situations `TransactionStatus` flattens, and each is acted on differently:

- **`REJECTED` vs `UNDELIVERED`** — an explicit supplier `cancel` versus retries running out with no verdict. Both used to write the same `FAILED_PROVIDER`; the second is worth retrying by hand, the first is not.
- **`UNCONFIRMED`** — the duplicate-idtrx path: uxiolabs has the order but we hold no id for it, and `/status` has no lookup by our own reference, so nothing can poll it. `SyncProcessingUxiolabsCommand` already chased this state by guessing at `supplier_trx_id IS NULL`.

**Never maintain `provider_status` by hand at a call site.** `App\Support\Transaction\ProviderStatusPolicy` holds the matrix (a default plus an allowed set per status) and `TransactionObserver::saving()` applies it to every save: a writer that touches only `status` gets a correct value automatically, and a contradictory pair is refused. A dozen places write `status`; a convention would have lasted until the thirteenth. Only four places write the column explicitly, and only because they know something the status cannot express (`ProcessUxiolabsTransactionAction`, `ProcessUxiolabsTopup::failed()`, `HandleUxiolabsWebhookAction`, `CheckUxiolabsTransactionStatusAction`).

**`REFUNDED` preserves the previous provider value rather than defaulting.** A refund records that money came back, never whether the supplier delivered — without this rule, "the supplier failed and we refunded" and "the supplier delivered and an admin refunded as goodwill" become indistinguishable. It is also why the refund actions need no changes.

Two rules that keep the guard airtight:

- **Never `saveQuietly()` a `status` change.** It suppresses model events, including this guard — the one remaining bypass. The two existing call sites are safe only because neither has `status` dirty.
- **No guard may read `provider_status`.** `transactions.status` stays the sole decision-maker for every terminal-state check, `RefundEligibility`, and `AdminRetryTransactionAction`. The new column is display and filter only, which also makes rollback trivial.

### Payment Status Codes (`App\Enums\PaymentStatus`, stored as string in `payments.status`)

| Value | Enum case | Meaning |
|---|---|---|
| `'1'` | `PENDING` | Pending |
| `'2'` | `EXPIRED` | Expired / Failed |
| `'3'` | `SUCCESS` | Success |
| `'4'` | `REFUNDED` | Refunded |

### Refunds

**There is no automatic gateway refund.** `InitiateRefundAction` (`app/Actions/Refund/`) is the single entry point, idempotent three ways over: a transaction row lock, a `PaymentStatus::SUCCESS` gate, and a unique `refund_requests.transaction_id`. Its four callers are unchanged (uxiolabs webhook, status poll, `ProcessUxiolabsTopup::failed()`, admin).

**Only the product price comes back.** The refunded figure is `transactions.amount_base` — the frozen selling price, already net of promo and of any points spent — and it deliberately **excludes the channel fee** (`payments.admin_fee`): that fee bought a payment that really did settle, and Monetapay kept its cut of it either way. Do not "simplify" this back to `payments.gross_amount`; that returned the fee too and cost the platform `admin_fee` on every refund. Points spent come back separately, as points.

Every refund ends up in a wallet — the only question is whose, and how soon:

- **Member → wallet, immediately.** `WalletLedger::record(type: 'refund')` — never a raw `increment`, so it lands in `balance_mutations` with before/after figures. `payments.status` and `transactions.status` both go `REFUNDED` in the same transaction, and the merchant settlement is reversed post-commit. Method `balance`, born `COMPLETED`, zero admin actions.
- **Guest → the claim queue.** Method `balance_claim`, born `WAITING_ACCOUNT`, with a claim link emailed (and WhatsApped once delivery is switched on — see **WhatsApp delivery is off by default**). There is no account to credit yet: the customer follows the link, creates or signs in to an account, and an admin verifies it before the balance moves.
- **`manual_transfer` is retired.** No new rows are opened this way, but the ones already open still drain through the same admin queue, so every payout guard must keep handling it. It is legacy, not dead.

**The load-bearing invariant is that `payments.status` flips exactly when the credit happens** — at initiation on the member path, at `complete` on both guest paths. `GetFinancialSummaryAction` and `ReconcileGatewayFeesAction` read that column as cash out, and since unclaimed refunds never expire a row can legitimately sit `SUCCESS` for months. Flipping it at request time would report money that is still in the account.

#### The claim (`/v1/refund-claims/*`, public, `throttle:refund-claim` 6/min)

- **The CTA on the failed-invoice page cannot carry a credential.** `GET /v1/invoices/{inv}` deliberately never returns the claim token, and registration has no email verification (`MustVerifyEmail` is commented out on `User`), so "my email matches the order" is an unverified self-assertion. A signup form reachable from an invoice number alone would let anyone who saw a screenshot take the money. The CTA therefore links to `/{locale}/refund?invoice=…`, which re-sends the link out of band; **the account form only ever lives behind a resolved token.**
- Only `sha256(token)` is stored (`RefundClaimToken`), with a 30-day expiry. `ClaimRefundWithAccountAction` **nulls the token on use** — otherwise a forwarded copy of the same email lets a second person re-bind the refund.
- `RefundContactMatcher` is the second lock: the claiming account's email or phone must match the order's, reusing `Phone::candidates()` rather than a third copy of the spelling rules (see **Phone numbers**). The matched field and its value are **frozen** onto the row (`claimed_contact_match` / `claimed_contact_value`) — the account can change its email before an admin looks.
- Two endpoints, not one optional-auth endpoint: `POST /{token}/register` (delegates to `Auth\RegisterAction`, so the seeded-member-role rule stays in one place) and `POST /{token}/attach` (`auth:sanctum`, for the returning buyer who cannot register again against a unique email).
- **`POST /refund-claims/resend` answers identically for a hit and a miss** and delivers out of band, the same anti-enumeration reasoning as `forgot-password`. Matching is invoice **AND** contact. It gates on `RefundStatus::claimable()`, **not `payoutEditable()`** — the latter omits `WAITING_ACCOUNT`, which would silently disable resend for every refund opened under the current scheme, invisibly, because the response is constant. A 5-minute rotation cooldown stops anyone with the invoice and contact from killing a victim's live link forever now that rows sit unclaimed for months.
- **Never guard a payout with status alone.** `payoutEditable()` includes `PENDING`, and a claimed `balance_claim` refund also sits in `PENDING`; a status-only check would re-open the bank-transfer form on the scheme that retired it and then sail through the `hasPayoutDetails()` guards. `RefundRequest::isPayoutEditable()` / `requiresPayoutDetails()` ask method and status as one question.

#### The admin queue (`/v1/refunds`, `auth:sanctum` + `admin`)

`WAITING_ACCOUNT → PENDING → PROCESSING → COMPLETED | REJECTED`. A claim notifies role `admin` via `NotifyRoleAction` (a sibling of `NotifyPaymentInternalAction`, whose recipient cache is payment-internal-specific) plus Discord, and stamps `verify_due_at` from `RefundSla` — 2×24 **working** hours, weekends and `config/refund.php` holidays skipped. The clock starts at the claim, never at the refund: an unclaimed row is waiting on the customer.

`PROCESSING` still means "a named admin holds this". Its purpose has widened: under the retired scheme it stopped two operators making the same bank transfer, and under this one it stops two verifying the same account in parallel and reaching opposite conclusions.

`CompleteRefundRequestAction` stays the single "money has moved" verb — **do not add a `verify-credit` endpoint.** The claim lock, `refunded_at`, both status flips and the settlement reversal are keyed to it, and a second writer of `COMPLETED` would duplicate all four and need re-covering by every guard test. It branches on method instead. Money-safety rules inside it:

- The credit runs **inside the action's own `DB::transaction`**, not post-commit beside `reverseSettlement`. `WalletLedger::record` opens a nested transaction that becomes a savepoint; `InitiateRefundAction` already relies on this.
- **The refund row is the idempotency key** — `refunded_at !== null` throws, alongside the status guard. Do not give `WalletLedger` an idempotency key of its own.
- **Lock order is refund → user; the user row is taken last, everywhere.** `InitiateRefundAction` takes transaction → user, checkout takes user first and nothing after. Locking the claimant early "to validate" inverts that and opens a deadlock against checkout.
- A deleted claimant (`claimed_user_id` is `restrictOnDelete`, so this should be unreachable) and a non-`active` account both throw `RuntimeException` → 422. Crediting balance to an account that cannot spend converts a refund into a liability that never discharges.

**Two rejections, deliberately.** `RejectRefundRequestAction` closes the refund (the order turned out to be fulfilled); `RejectRefundClaimAction` refuses only the *account* — it detaches the claimant, increments `claim_rejected_count`, returns the row to `WAITING_ACCOUNT` and issues a fresh token **to the contact on the order**, never to the account just refused. Collapsing them would bury a real buyer's refund permanently, because `refund_requests.transaction_id` is unique: a `REJECTED` row can never be re-opened by `InitiateRefundAction`, which just hands the same row back while `RefundEligibility` reports the transaction as refundable again. That trap was theory when rejection was rare; turning away bad claims is now routine.

**`transactions.user_id` is never rewritten on a claim.** It drives merchant/member attribution, `UnifiedTransactionQuery` and every report; retro-assigning it would move a guest sale into a member's history for a period when the account did not exist. The consequence is designed for, not ignored: the failed order does **not** appear in the member's order history, so the credit shows up in `balance_mutations` (referenced by invoice number) and in `GET /v1/me/refunds`, which backs the storefront's "Pengembalian Dana" page. Do not paper over this by unioning claimed transactions into the order-history query.

`ReverseMerchantSettlementAction` (`app/Actions/Settlement/`) mirrors `SettleMerchantTransactionAction` **at the moment money leaves** — inline for a member, on `complete` for a guest (either scheme), never on `REJECTED`. Rules it must keep:

- **It writes exactly one leg: the merchant's `-amount_base`.** The platform's books need no correction, because the platform did not refund anything — it keeps `admin_fee` and it paid `gateway_fee + tax_amount` out of it, which is precisely what settlement booked as profit. It used to un-book the markup and then re-book the gateway cost; together those netted to `-admin_fee`, correct only while the customer was refunded the full gross. **Do not re-add a platform leg without also changing what the refund pays.**
- Should a platform leg ever return it must be typed **`markup` with a negative amount**, not `markup_reversal`: `PlatformBalance::income()` whitelists `['markup','withdrawal_fee','service_revenue']` and would silently ignore anything else, leaving kita's withdrawable balance inflated by every refund.
- Every leg references **`RFD-{invoice}`**, never the bare invoice number, or settlement's own `(type: settlement, reference: invoice)` idempotency guard would match a reversal. That reference is also the crash-safe idempotency marker, now read from `balance_mutations` (and still from `platform_mutations`, for reversals booked under the old three-leg scheme).
- It **never fails a refund.** `WalletLedger` throws when a merchant's balance would go negative (they already spent it); that is caught, alerted to Discord, and the refund proceeds.

`MonetapayService::refundTransaction()` and `POST /v1/monetapay/refund` stay as the manual admin tool, deliberately outside every automatic path. Legacy rows refunded by the old flow are backfilled as `method = legacy_gateway`, so the refund page is authoritative for all of history rather than only since the rewrite.
---

### Phone numbers

**Canonical form is E.164 with the plus** (`+6281234567890`), any country, and it never starts with a `0` — a country code cannot. `App\Support\Phone` owns every transform:

- `toE164()` — a typed `+<code>` is taken at the customer's word; `00…` drops the international call prefix; `0…` and a bare national number fall back to `config('services.storefront.default_country_code')` (`62`). That fallback is the *only* Indonesian assumption left, and it is what lets an ordinary `0812…` work without a country picker. Length is gated to E.164's 8–15 digits.
- `candidates()` — the read-side spelling set. It exists because **contact columns are only normalised on write from this release and the old rows were deliberately not migrated**: `0812…`, `62812…` and `+62812…` all still live in the same column. Only the default country gets a `0…` spelling generated; a foreign number was never written locally here, so inventing one would only widen every lookup. **Do not lower its 8-digit floor** — that is what stops a short prefix being cheap to iterate, and `TrackOrdersAction` refuses prefix matches on the strength of it.
- `toIndonesianLocal()` — `08…`, or null for anything not `+62`.

**Normalisation happens in `prepareForValidation()`**, via `App\Http\Requests\Concerns\NormalizesPhoneInput`, and nowhere else. That seam is not a style choice: the uniqueness check has to run on the canonical value, so normalising in a DTO or action would let `0812…` and `+62812…` both pass and land as two accounts for one person. The trait never materialises a key the caller did not send (`guest_contact` is required for a guest, `nullable` for a member) and keeps the raw value when normalisation fails, so a typo reaches the E.164 rule instead of hiding behind `required`.

**`App\Rules\UniquePhone` replaces `unique:users,phone`.** A plain unique compares one string against a column holding three, so a customer stored as `0812…` who registers again would get a *second* account — with no order history, and with the refund claim form's "sudah terdaftar, masuk ke akun tersebut" hint never firing. It checks `whereIn(Phone::candidates(...))`, at most five constants against a unique index.

**Two consumers are still Indonesia-bound and are guarded, not internationalised:**

- `MonetapayService` — settles in IDR to Indonesian banks and e-wallets, where on an e-wallet charge the phone *is* the wallet identity. `account_phone` goes through `toIndonesianLocal()` and falls back to the existing placeholder rather than forwarding a foreign number.
- `ProcessWithdrawalPayoutJob` — the explicit `account_phone` is validated Indonesian and passes through; the **`merchant?->phone` fallback** is guarded, because that is the one path a now-international contact number could leak into a disbursement and fail only after money moved.

`kontak` on the uxiolabs order is left raw — its own fallback is the literal `'0000000000'`, so it is not a format-validated field. The four PiWAPI senders are left alone: E.164 is exactly what they want.

Accepted and documented in the helper: a foreign number typed **bare** (a Singaporean `91234567`, no plus) reads as local. That is inherent to supporting country codes without a picker — an exact collision, not enumeration.

### WhatsApp delivery is off by default

WhatsApp is part of the future subscription, so nothing goes out over it yet:
`PIWAPI_ENABLED` (default **false**) gates both PiWAPI senders — the purchase
receipt (`SendTransactionWhatsAppJob`) and the refund notifications
(`SendRefundWhatsAppJob`). **Email is unaffected and is the only channel right
now.**

`PiWapiService::canSend()` is the guard every caller must use; it is
`isEnabled() && isConfigured()`, so a switched-off gateway drops the send
silently instead of reaching the API — including a job already sitting in the
queue when the switch flips. `isConfigured()` (credentials present) stays its own
question on purpose, so the Integration page can still report a reachable gateway
while delivery is off. Flipping `PIWAPI_ENABLED=true` is the whole re-enable.

### Membership-plan pricing

**A membership plan is the pricing tier.** It used to be a way to *buy a role*: a plan granted `role_id`, and `RolePrice` matched that role name against one of four fixed price columns. That capped the platform at four tiers forever — a fifth plan an admin created could never have its own price.

```
supplier cost
  + product_plan_prices.margin_percent (authored)   → overrides everything
  + pricing_rules (category, plan) → (NULL, plan) → (category, NULL) → (NULL, NULL)
  + products.price_min / price_max (clamp)
  → PricingService::computePlanPrices()  →  array<planId, price>
  → WritePlanPricesAction                →  product_plan_prices  (+ products.price_member)
  → PlanPrice::for(product, user)        →  the quoted and billed price
```

**Resolution** (`App\Support\Pricing\PlanPrice`): the user's plan (`users.membership_plan_id`, guests and NULL → the default plan) → that plan's `product_plan_prices` row → the default plan's row → `products.price_member` **with a logged warning**. That last rung is the alarm, not a feature: reaching it means `pricing:backfill-plan-prices` never ran, and every paying member is being sold at the base tier. Nothing errors — it is a silent revenue leak, which is why `pricing:verify` exists and why the backfill must run in the same deploy step as `migrate`.

**`products.price_member` is a denormalised copy of the default plan's price.** Six queries sort and filter on it (the public price list, the SSR topup page, marketing strike-throughs, the admin product filter), and turning those into joins would cost an index for no gain on the pages with real traffic. The price of that choice is one invariant — `price_member` must equal the default-plan row — so `WritePlanPricesAction` is its **single writer** and `pricing:verify` proves no second one appeared. `ListGameProductsAction` is the one listing that must be plan-aware: it eager-loads `planPrices` and **sorts in PHP after pricing**, because ordering by the default price while showing another plan's prices is a whole class of bug for nothing.

**`pricing_rules` are keyed on `membership_plan_id`, and NULL means "every plan"** — the rung that keeps an admin-invented tier priced instead of unpriced. MySQL treats NULLs as distinct, so the unique index cannot stop two `(NULL, NULL)` rules; the guard lives in `Store/UpdatePricingRuleRequest::withValidator`. `PricingService::DEFAULT_MARKUP_PERCENT` became a single scalar (`settings.pricing.default_markup_percent`): there is no sensible built-in default for a tier invented this morning.

**Roles no longer decide price.** Subscribing writes `users.membership_plan_id` and leaves `role_id` alone; `memberships:expire` reverts the *plan*, not the role — reverting the role would strip an admin-assigned one from someone who merely let a subscription lapse. Roles gate admin and payment-page access, nothing else.

**The default plan** (`membership_plans.is_default`) is created by migration, priced at zero, and is what every account without a subscription resolves to. `MembershipPlanObserver` enforces exactly one (MySQL has no partial unique index), refuses to delete it, and **reassigns a deleted plan's holders to it** — `PlanPrice` resolves per product row and cannot afford an existence check on each one, so a deleted plan would otherwise keep pricing people from a row the admin can no longer see. Plans are soft-deleted, because a hard delete cascades away price rows that past invoices point at.

**Transitional, dropped in a follow-up release:** `PricingService::computePrices()` still returns the legacy five-column shape (the columns are `NOT NULL`, and eight callers still write them), deriving `price_vip`/`price_reseller`/`price_agent` from whichever plan grants that role and mirroring the default tier when none does. `pricing_rules.role` is nullable and unread. `supplier_products.margin_*` still feeds the per-SKU "Set Profit Margin" screen through that same bridge — per-SKU margins are still authored on the four legacy tiers, while *pricing rules* are fully plan-driven.

### Loyalty points

Points are earned on completed orders and spent as a checkout discount. Until
this release they were a dead scaffold: `users.point` and `point_histories`
existed, but the admin CRUD wrote the history table **without ever moving the
balance column**, and nothing earned or spent a point. That table is left alone
as legacy; `point_ledger` is the real one.

**`App\Support\Points\PointLedger` is the only place `users.point` moves**, a
line-for-line mirror of `WalletLedger` — one writer, a row lock over the whole
read-modify-write, before/after figures on every entry, and a refusal to go
negative. Points are worth money; the reasoning that made the wallet
trustworthy applies unchanged.

**Earning happens only at `COMPLETED`** — payment settled *and* the supplier
delivered — so a failed order never produces points that would have to be taken
back. `GrantTransactionPointsAction` is called **explicitly at each of the four
COMPLETED sites**, never from an observer: `saveQuietly()` bypasses observers,
which is tolerable for a bookkeeping column and not for granting something worth
money, and the precedent already exists — `SendTransactionReceiptAction` is
called by hand at the same four places, so the two sit together.

**Exactly-once is the unique `(transaction_id, type)` index**, not the
pre-check inside the action; that is only the fast path. Same shape as the
unique `refund_requests.transaction_id`.

Earning is `ceil(amount_base × percent / 100) + flat` from
`products.point_percent`/`point_flat`, falling back to the `points` settings
group so a new SKU is not silently worthless. The base **excludes
`points_spent_amount`** — otherwise a customer harvests points from points.

**Spending** happens at checkout step 4c, after the promo and **before** the
fee, which is what leaves `payments.gross_amount` as the rupiah remainder a
refund has to give back. Three things follow from that placement and are easy to
get wrong:

- **Points are not taken out of margin.** A promo is the platform eating its own
  margin; a point was already paid for in cash on an earlier order, so that
  money is in the till. Charging it to margin would make the margin guard reject
  a legitimate redemption on a thin product. `points_spent` /
  `points_spent_amount` are their own columns so finance can report the cost of
  the programme, and so an order that used points is marked as such.
- **A fully covered order owes Rp 0**, so `$isExternal` is false regardless of
  the channel the customer picked, and the `min_amount` guard is skipped. The
  `payments` row is still written at zero — `InitiateRefundAction` stops at
  `! $payment`, so without it a points-paid order could never be refunded.
- **`WalletLedger::record` throws on a zero amount.** Both the Rp 0 checkout and
  the Rp 0 refund are guarded on `> 0`. This is the single most likely crash in
  the feature.

**On refund**, points come back as points (`refund_return`) and only the product
price in cash (`amount_base`, which points already reduced) as balance — converting them would turn a deliberately failed purchase
into a way to cash points out. A **goodwill refund of a delivered order** is
reachable (`RefundEligibility` checks the *payment* status), so earned points are
clawed back as `earn_reversal` — **capped at the remaining balance, never
negative**, with the shortfall logged. A negative point balance would silently
swallow everything the customer earned next with nothing on screen to explain it.

`membership_plans.allows_point_spending` bars a plan that already buys a
discount from also spending points.

### Membership auto-renewal

`memberships:renew` (00:10, before `memberships:expire` at 00:15) charges the
wallet for a duration-based plan about to lapse. On by default —
`users.auto_renew`, switchable at `PATCH /v1/me/membership/auto-renew`.

**The switch lives on the user, not the subscription.** Turning it off means
"stop billing me", and a per-subscription flag would have to be copied forward
on every renewal, where one missed copy silently switches billing back on.

**Renewal writes a *successor* subscription** starting where the old one ends.
That is what makes `ExpireMemberships`'s existing `$stillCovered` check close
only the old row — so the two commands need **no ordering guarantee** between
them, which is far more robust than relying on a five-minute cron gap.

`membership_subscriptions.renewed_into_id` is uniquely indexed and is the
idempotency key: a row lock does not protect two workers on separate
connections, and this debits a wallet. Renewal is skipped (and the membership
lapses normally) when auto-renew is off, the plan was deactivated, the wallet
cannot cover it, or **the plan price rose more than 20% above `price_paid`** —
silently charging a much larger figure than someone agreed to is how disputes
start.

### Token abilities

**`abilities:access-api` is on every protected route group, and every new one must carry it.** `auth:sanctum` on its own accepts *any* unexpired personal access token whatever it was minted for — so without the ability check the 30-day `refresh_token` (abilities `['issue-access-token']`) was a full API session, kept by the admin panel in a JavaScript-readable cookie and surviving a password change. `Sanctum::actingAs($user)` defaults to **no** abilities, so tests must pass `['access-api']`. `Tests\Feature\Auth\TokenAbilityTest` is the guard on all of this.

The `login` limiter is keyed on `email|ip` **and** a looser per-IP ceiling: it is shared with `/register`, `/forgot-password` and `/reset-password`, so a single per-IP bucket meant five colleagues signing in from one office locked out password recovery for everyone behind that address.

### Two-factor authentication

TOTP, hand-written in `app/Support/Auth/{Base32,Totp}.php` against RFC 6238 — the same reasoning as `Phone` and `RefundClaimToken`: sixty lines against a frozen spec. **`Tests\Unit\Support\Auth\TotpTest` runs the RFC Appendix B vectors; if those pass the implementation is correct.**

**Mandatory for the `admin` role, optional for everyone else.** `EnsureTwoFactorSatisfied` guards the admin group and answers 403 with `data.code = two_factor_setup_required`; `UserResource` also emits `two_factor_enabled`/`two_factor_required` so the client can route *before* firing a request that will be refused. The panel makes several requests per page, so relying on the 403 alone showed a generic toast from whichever request lost the race — `lib/axios.ts` branches on that code explicitly.

**`IssueSessionAction` is the one place a login becomes a session.** Password, Google and registration all go through it. Three separate copies of "mint the token pair" used to exist, and bolting a gate onto each would have meant the fourth path added next year bypassing it silently — the most likely way this feature regresses. Google sign-in is gated too: Google verifies an *email address*, not a device, and `GoogleLoginAction` auto-links a Google identity to an existing password account, so treating it as the second factor would be a way around the authenticator the admin enrolled.

**The challenge is a table row, not a Sanctum token** (`two_factor_challenges`, `App\Support\Auth\TwoFactorChallengeToken` — a twin of `RefundClaimToken`, sha256-only). An ability-scoped token would have made the challenge's safety depend on `abilities:access-api` being present on every route added from here on; one omission would silently turn it back into a session. Nothing resolves a challenge except `/v1/auth/2fa/verify`.

Things that are load-bearing and easy to undo:

- **The failure path must not be inside a transaction.** Throwing out of one rolls the attempt counter back with everything else, leaving the challenge brute-forceable for its whole five-minute life. Five wrong codes destroy it — that, not the rate limiter, is the primary control, and it cannot be spread across IPs because a fresh challenge costs a correct password.
- **`users.two_factor_last_used_timestep` stops replay.** The ±1 drift window otherwise leaves one code valid ~90 seconds, and the realistic attack on TOTP is a phishing proxy relaying a code the victim just typed.
- **The login response, when a factor is owed, carries the challenge and nothing else** — no user, no email, no role. Returning the account would be a free enumeration and role-disclosure oracle for anyone with a leaked password list.
- **Any change to the second factor revokes every token, and then mints one fresh pair.** Someone enabling 2FA because they suspect a compromise would otherwise leave the attacker's 30-day refresh token alive. The mint happens *after* the sweep and inside the same transaction, so the rule is intact — every token an attacker held is gone — and the admin who just proved a code is not made to sign in a second time in the middle of a step the panel forced on them. `confirm` and `rotate/confirm` therefore answer with the same `{user, access_token, refresh_token}` shape as `verify`; a client that ignores it is left holding a token the API already destroyed.
- **`POST /2fa/setup` 409s when 2FA is already on.** Rotating a live secret needs the password, or a hijacked session could silently re-enrol its own authenticator.
- `two_factor_secret` uses the `encrypted` cast, so **rotating `APP_KEY` bricks every enrolled authenticator**.

**Moving the authenticator is its own verb, and it never lowers the guard.** `POST /2fa/rotate` (password **and** a code from the device being replaced) writes `users.two_factor_pending_secret`; `POST /2fa/rotate/confirm` promotes it on a code from the *new* device. Both sit beside setup/confirm, outside the `admin` group, and carry `throttle:two-factor`.

- **The pending secret is a separate column for one reason.** `two_factor_secret` and `two_factor_confirmed_at` are untouched until the promotion, so a rotation abandoned halfway — a tab closed, a QR scanned onto the wrong phone — leaves the old authenticator working. Overwriting the live secret instead would lock an admin out of their own panel, discovered at the worst possible moment. Before this existed the only route was `disable` then `setup`, which signs the admin out mid-act and leaves the account with **no** second factor in between.
- **`rotate` passes `two_factor_last_used_timestep`; `rotate/confirm` passes `null`.** The first is the replay guard aimed at the one action that hands over the account — without it the code just spent logging in would move the authenticator, which is exactly what a phishing proxy relays. The second is `null` because timesteps are wall-clock and the stored one belongs to the *old* secret: passing it would reject a perfectly good code from the new device for landing in the same thirty seconds. The new secret has authenticated nothing anywhere and every token dies a line later, so there is nothing to replay.
- **`two_factor_confirmed_at` is never rewritten by a rotation.** It records that the account has had a factor since a date, not which phone holds it.
- An unconfirmed rotation expires after `TwoFactorAction::PENDING_TTL_MINUTES` (10) and is cleared by `disable` and by `two-factor:disable`. `UserResource` emits `two_factor_pending` so the panel can say a move is outstanding.

**Enrolment is a step inside signing in, not a page in the panel.** The admin panel routes an un-enrolled admin to `/two-factor-setup` on a bare layout before the dashboard mounts; the 403 `two_factor_setup_required` branch in its axios interceptor is now the safety net for sessions predating that guard, not the main road.

**No recovery codes in this release, deliberately.** The admins are a small in-house team with shell access, and `php artisan two-factor:disable {email}` is a complete answer that removes a whole surface. That stops being true the day 2FA is extended to `payment-admin` — clients with no shell — so ship recovery codes in *that* release.

**Deployment consequence, pinned by `GameCatalogSeedTest`:** every pre-existing admin is refused the panel until they enrol. The way out is always open because `/2fa/setup` and `/2fa/confirm` live outside the admin group.

**One account is exempt, and only one.** `users.two_factor_exempt` — granted by `DeveloperUserSeeder` to `developer@uxiotopup.id` — is a deliberate hole: that login never owes a factor, so the developer can get in when the authenticator is lost. `App\Support\Auth\TwoFactorPolicy::requiredFor()` is the single answer to "does this account owe one", read by the panel gate (`EnsureTwoFactorSatisfied`), the client's navigation signal (`UserResource.two_factor_required`) and the login door (`IssueSessionAction`). Three separate copies is exactly how one of them ends up disagreeing — either bouncing the developer to the setup screen the API has already waved through, or leaving a normal admin with a password alone. `where two_factor_exempt = 1` lists every account that skips the factor.

### Language (ID/EN)

**`App\Support\Locale\SupportedLocale` is the one definition of which languages exist.** The set
used to be implied in three places that disagreed: `config('app.locale')` said `en`, the
`users.locale` column default said `id`, and `GenerateInvoicePdfAction` carried its own whitelist.
The visible consequence was that every Google sign-up was stored as an English speaker while
password sign-ups were Indonesian. **The platform default is now `id`** — the market is Indonesia,
prices are in rupiah, and a bare phone number is assumed to be `62`.

**`SetLocale` is appended to the `api` group**, alongside `EnsureSiteIsServing`, and global for the
same reason: the language of a response must not depend on which endpoint was hit. Resolution runs
`users.locale` → `Accept-Language` → `config('app.locale')`, and an unsupported value at any rung is
skipped rather than rejected — a browser set to Japanese is not a bad request, and a `users.locale`
written before the column was constrained should degrade, not break the account. It reads
`$request->user('sanctum')`, not `user()`: it runs on unauthenticated routes too, where the default
guard is `web` and cannot see a bearer token.

**`lang/id/validation.php` and `APP_LOCALE=id` are one change, not two.** Flipping the locale without
the file leaves every message falling back to English, which is worse than where it started. Before
this, twelve FormRequests overrode `messages()` in Indonesian while ~150 fell through to Laravel's
English defaults — so the language of an error depended on the endpoint. English still works with no
`lang/en/validation.php` because the framework ships its own.

**`PATCH /v1/me/locale` is its own endpoint, not a field on `sync-timezone`.** That route's name
promises one thing, and the two are different kinds of fact: a language is chosen by a person, while
the timezone is not a choice at all. The platform runs on one wall clock — WIB — and every panel
renders it, so `sync-timezone` survives only as a compatibility shim that normalises a stale account
onto `Support/DateTime/Wib::TZ`. Login, register and the Google path do the same; `users.timezone`
is stored, never obeyed.

**Still outstanding:** `ApiResponse` and the ~4,000 literals across `app/Http/Controllers` and
`app/Actions` are untouched, so most `message` fields remain hardcoded and mixed
("Login successful" next to "Autentikasi dua faktor aktif." in the same controller). That needs
triage into the few hundred a user actually reads, not a sweep. `lang/{en,id}` already holds
`receipt`, `refund`, `whatsapp` and `locale`.

### Discord notifications

`DiscordWebhookService` is the only sender, and three rules keep the channel worth
reading. They were written after a run put **29 messages into it in one minute** — five
supplier webhooks reporting `PROCESSING ➔ PROCESSING`, eleven routine refund claims
dressed as 🚨 alerts, four copies of one misconfiguration — burying the single message
that needed a human: a merchant balance that could not be debited.

- **Non-production is silent.** The flood was factory data (`fake()->words(2, true)`
  channel names, `RFD-` + 12 random chars, every refund exactly Rp 12.000) from a seeder
  on a box whose webhook pointed at the live channel. Set
  `DISCORD_SEND_OUTSIDE_PRODUCTION=true` where a staging feed is wanted; it arrives
  prefixed `[STAGING]`. `testing` passes through unlabelled — a test that configures a
  webhook is exercising the path deliberately, and labelling it would force the prefix
  into every title assertion in the suite.
- **Pick the severity.** `sendAlert` is the alarm and means "someone must act now".
  `sendNotice` is for routine business events — a refund claim is workflow, not an alarm.
- **A system-level problem is reported once.** `sendAlertOnce($key, $message)` guards with
  `Cache::add` for an hour. A missing `STOREFRONT_URL` is one problem however many refunds
  hit it; reported per row it produced one message per refund. The window expires rather
  than latching, because silence is a reminder suppressed, not a problem closed.
  Two older call sites roll their own guard with different windows and stay as they are:
  `PollUxiolabsStatusJob` (24h per transaction) and `SyncChannelSettingsFromHubAction`
  (once per channel per day — the scheduler runs it 96 times a day).

**`HandleUxiolabsWebhookAction` announces only a real status change.** uxiolabs
re-delivers `processing` while an order is in flight. The gate is on the Discord call
alone, never on `$notification` — that variable also drives the refund and the receipt,
both of which must keep running on a redelivery.

**Supplier outcomes go through `SendUxiolabsStatusNotificationAction`, from every path.**
Monetapay announced every payment it took while fulfilment announced nothing unless the
callback fired — so the channel read "💳 Pembayaran Diterima" and then went silent,
whether the customer got their diamonds or the order died upstream. The callback is the
*unreliable* path (`PollUxiolabsStatusJob` exists because of it), so the one path that
reported was the one least likely to run. Five call sites now report:
`ProcessUxiolabsTransactionAction` (`handoff()`, plus a terminal order response),
`CheckUxiolabsTransactionStatusAction` (poll and admin resend, labelled by `$source`),
`HandleUxiolabsWebhookAction`, and `ProcessUxiolabsTopup::failed()`.

- **Deduped per transaction per outcome** (`Cache::add`, 24h). Poll and callback race the
  same transition *by design* — either may be the one that survives — so the guard sits
  below both rather than in a choice of which to keep. Announcing per writer would double
  every fulfilment in the channel.
- **`handoff()` is the only place `supplier_trx_id` reaches the channel**, and it is the
  key that opens the order on the supplier's dashboard. Its absence behind a payment is
  itself the signal: an order that never left.
- Add a new supplier-status call site here, not with a fresh `sendEmbed` — a second embed
  shape drifts from the Monetapay one, and the two halves of an order's life land in the
  same channel minutes apart.

**The suite must never inherit a real webhook.** `phpunit.xml` pins
`DISCORD_WEBHOOK_LOG_URL` empty alongside the other outbound gateways. A developer's
`.env` holds the live channel URL and the service deliberately lets `testing` through, so
without that pin every fulfilment test is a would-be post to the channel operators watch.

### In-app notifications

`notifications` is one row per recipient with its own `read_at`, and
`NotificationController` scopes **every** query to `$request->user()->id`
before any filter. That scoping is why one controller serves three route
groups — `v1/notifications` (admin), `v1/payment-internal/notifications`,
`v1/payment-admin/notifications`: **the group decides who may ask; it never
decides whose rows come back.** Adding a panel is registering the same four
routes in its group, not writing a second controller.

The feed shipped internal-only, and the admin bell was a button with no
handler — while `ClaimRefundWithAccountAction` had been raising
`refund.claimed` rows addressed to role `admin` since it was written. The rows
were unread because they were unreadable.

- **Three fan-outs, and the choice between them is about blast radius.**
  `NotifyPaymentInternalAction` (the kita team), `NotifyRoleAction` (everyone
  holding a role), `NotifyUserAction` (one named person). A client's bill is
  always the third: every merchant holds `payment-admin`, so a role fan-out
  would tell each of them about every other client's billing.
- **`dedupe_key` is per recipient** (`unique(user_id, dedupe_key)`), and null
  means "repeat freely". Give the same fact raised for two audiences two
  namespaces — `subexp:{id}:{n}` and `subexp-merchant:{id}:{n}` — or whichever
  runs first silences the other.
- **The expiry windows all start at `now`, so a row two days out matches H-7
  and H-3 in one run.** The internal team gets both by design, pinned by
  `PaymentPage\NotificationTest`; the client gets one, at the tightest mark
  that matches, carrying the **real** day count rather than the mark's name.
  Do not "fix" the overlap in the query — that is the internal contract.
- `NotificationCreated` broadcasts on `user.{id}.notifications` (authorised by
  self-ownership in `routes/channels.php`) and carries **only an id**: the
  client refetches through the authorised endpoints rather than trusting a
  socket frame with the contents. Both panels poll as the fallback.

### Links that leave the building

**Every customer-facing base URL goes through `App\Support\PublicUrl`, and none of
them has a fallback in `config/`.** A refund claim link once went out over WhatsApp
reading `http://localhost:5173/id/refund?token=…`: the message sent, `claim_notified_at`
was stamped, the refund row looked handled, and the person owed the money had no way to
claim it. The cause was a config default — `STOREFRONT_URL` fell back to a dev server, so
a deployment that never set the variable shipped that address to real buyers instead of
failing. `MONETAPAY_SUCCESS_REDIRECT_URL` had the same shape with `https://example.com`,
handed to a live payment gateway.

- **Unreachable is judged from the customer's network, not ours:** loopback, RFC 1918
  private ranges, the `.local`/`.test`/`.internal` dev TLDs, and IANA's `example.*`
  domains. Plain `http` on a real domain is **not** refused — a site behind a proxy that
  terminates TLS elsewhere is a real deployment.
- **What a caller does with a null differs by how much the link is worth.** The refund
  claim link IS the message, so an unreachable base **stops the send** and leaves
  `claim_notified_at` null, which the refunds page already renders as "never notified —
  contact manually" — a state an operator can act on. It never throws:
  `InitiateRefundAction` calls it post-commit, where nothing may fail the refund. The
  receipt's "track order" CTA and the admin's renew-subscription link are worth less than
  the page around them, so those are **omitted** and the rest still ships.
- **`urls:verify` is what stops this being found by a customer.** It exits non-zero and
  gates the deploy, alongside `pricing:verify` — same contract, same reasoning: turn a
  silent misconfiguration into a failed deploy.
- `phpunit.xml` supplies real-looking domains so the suite does not exercise the degraded
  path everywhere; `PublicUrlTest` overrides them per case.

### Money formatting

`App\Support\Money::rupiah(int)` is the one customer-facing format. It exists because most of `app/` called bare `number_format($n)`, which uses **US separators** — an error message read "Rp 1,500,000" for the very transaction whose invoice PDF said "Rp 1.500.000". Three Blade views each defined the identical closure. Console output (`$this->table()`, dry-run listings) deliberately does not use it: alignment and greppability matter more there.

On the storefront, `formatCurrency` **ignores its `locale` argument for currency and pins `id-ID`** — routing it through the page locale made every `/en/...` page render `IDR 15,231`, because `Intl` swaps to the ISO code for a currency foreign to the formatting locale. The parameter survives only so the ~45 call sites keep compiling. `formatDate`/`formatNumber` still honour it.

### Website subscription CTA

`GET /v1/website-subscription` feeds the admin sidebar footer, so it **always answers 200** — no default merchant, no matching service, no subscription are all statuses, never exceptions. The service is resolved by `App\Support\Payment\WebsiteService` from the setting `payment.website_service_code`, because nothing on `services` marks one row as "this site".

**Do not use `ServiceSubscription::scopeActive()` here.** It also filters `ends_at > now()`, so a lapsed subscription would return nothing and "expired" would be indistinguishable from "never subscribed" — the two states this card exists to tell apart. Renewals stack as new rows, so the answer is the raw `MAX(ends_at)` with `status = ACTIVE`.

The caller is an `admin` but the billing data belongs to the site's `payment-admin` merchant (`DefaultMerchant`). Those roles are kept strictly apart everywhere else; here they are one company reading its own bill.

### Site logo

`SettingController::upload()` scopes allowed formats to the setting's `key`: only `logo` accepts `gif`, with a 5 MB ceiling instead of 2 MB. Both halves matter. `ImageOptimizer` already refuses to re-encode an **animated** GIF (GD cannot write animated WebP; converting keeps one frame), and the admin panel's `imageCompression.ts` has the identical guard — so that file reaches disk uncompressed and is therefore the one most likely to be large. A GIF favicon is unpredictable across browsers and no link-preview scraper animates an OG image, which is why the other keys are unchanged.

## External Integrations

Every outbound integration the engine depends on sits behind a **contract**, and the implementation is chosen by config — never by editing the engine:

| Contract | Chosen by | Default adapter |
|---|---|---|
| `App\Contracts\SupplierGateway` | `SUPPLIER_DRIVER` → `services.supplier.adapters` | `UxiolabsService` |
| `App\Contracts\PaymentGateway` | `PAYMENT_DRIVER` → `services.payment.adapters` | `MonetapayService` |
| `App\Contracts\ReceiptChannel` (a LIST, not one choice) | `config/notifications.php` → `notifications.receipt` | email + WhatsApp |
| `App\Contracts\RefundClaimChannel` (a LIST) | `config/notifications.php` → `notifications.refund_claim` | email + WhatsApp |
| `App\Contracts\RefundCompletedChannel` (a LIST) | `config/notifications.php` → `notifications.refund_completed` | email + WhatsApp |

`App\Support\Integration\AdapterResolver` resolves each one AND validates it against its contract, failing loudly on an unknown driver or a class that does not implement it — so a misconfiguration stops at resolution rather than on the money path. Adding a supplier, a gateway, or a notification channel therefore means **one class plus one config line**; engine code injects the contract type, never the concrete class. `QueryMonetapayAction` is the deliberate exception: it is a vendor diagnostic console, not engine surface.

Two related pieces of release plumbing: `GET /v1/version` reports `version` / `commit` / `upstream` / `hub_contract` (from `config/version.php`, stamped into `.env` by the deploy) and stays open while a site is dark; and `php artisan hub:ping` exits non-zero when `HUB_ENABLED` but the Hub is unreachable, which is what the deploy gates on.

### Monetapay (Payment Gateway)

**Do not alter the cryptography logic** in `MonetapayService` — it is stabilized against the official PHP SDK.

Key points:
- AES-128-CBC with `"\0"` null-byte padding (not `"0"` char) via `str_pad($value, 16, "\0")`.
- Outbound signature: `md5(md5(TOKEN + "*|*" + sortedParams + "@!@" + timestamp))`.
- Inbound callback: same Double MD5 algorithm, verified via `verifyCallbackSignature()` using `hash_equals()`.
- Endpoint selection is driven by `payment_type` on `PaymentChannel`: `'qris'` → `/v1.0.0/qris`, anything else → `/v1.0.0/virtual_account`.
- Config keys: `services.monetapay.{mch_id, sub_mch_id, collection_app_id, disbursement_app_id, partner_key, token, aes_key, aes_iv, is_production}`.
- Four distinct identifiers — do not conflate them: `mch_id` is the merchant identity (only sent where the gateway expects a real `mch_id`/`parent_app_id`, e.g. `merchant_permission`, `sub_merchant`); `sub_mch_id` is the sub-merchant the site trades AS (see below); `collection_app_id` is the pay-in `app_id` (checkout/`createTransaction`, refund, and all collection inquiries); `disbursement_app_id` is the payout `app_id`.
- `collection_app_id` has **no fallback** — set `MONETAPAY_COLLECTION_APP_ID` explicitly per environment or collection calls sign with a blank `app_id`.
- `disbursement_app_id` is used exclusively by payout methods (7.x: createDisbursement, createLargePayout, createEwalletPayout, inquiryDisbursement, plus the account-validation pre-payout check); defaults to `mch_id` if unset.

#### Sub-merchant (`sub_mch_id`)

The site trades as **one** Monetapay sub-merchant under the parent `mch_id`, on the
parent's credentials — `sub_mch_id` is the only field that tells the gateway whose
books a call belongs to. It is set once (`MONETAPAY_SUB_MCH_ID`, or the admin's
"Sub-Merchant ID" field) and injected in exactly two places:

- **`postSigned()`** — covers every signed endpoint (inquiries, cancel, refund,
  subscriptions, bills, payouts) in one stroke instead of ~30 call sites. An
  explicit `sub_mch_id` from the caller still wins, so the operator tools can
  inspect a different sub-merchant.
- **`createTransaction()`** — added **before** `ksort()`, so it is part of the
  signed TreeMap. A field appended after signing travels but never verifies.

Two rules follow from how Monetapay re-signs a request:

- **Blank must be absent, not empty.** Monetapay drops blank fields from the
  TreeMap it recomputes the signature over, so `sub_mch_id=` would break the sign.
  The `array_filter` in `postSigned` and the `!== ''` guard in `createTransaction`
  keep an unset value out entirely — which is also why leaving it blank reproduces
  pre-sub-merchant behaviour exactly.
- **`inquirySubMerchant()` opts out** (`withSubMch: false`). 6.7.4 asks the PARENT
  about a registration; stamping our own `sub_mch_id` on it answers a different
  question.

`balanceCacheKey(null)` resolves through the *same* default, so the finance panel's
read and a ping's cache-bust land on one entry rather than two that drift apart.
Inbound callbacks naming a different `sub_mch_id` are **logged, not rejected** —
the order is matched by our own `mch_order_no`, and refusing on a field never seen
in a live payload would drop real payments. A warning there means the config is wrong.

### Withdrawal / Payout (Monetapay disbursement)

Two-stage: a merchant (`payment-admin`) requests a payout; kita (`payment-internal`)
approves it. `CreateWithdrawalRequestAction` holds the full `amount` via `WalletLedger`
at request time and freezes `fee`/`nett`.

- **Fee** = `services.withdrawal.fee_flat + round(fee_flat * fee_percent/100)` — a flat
  charge, **amount-independent** (default `1500 + 11% of 1500 = 1665`). `nett = amount - fee`
  (the merchant is disbursed `nett`; `fee` is kita's markup booked to the platform ledger on
  final success). `services.withdrawal.min_amount` (default 10.000) floors the request so
  `nett` stays positive — enforced by `StoreWithdrawalRequest` and re-guarded in the action.
- **Approve `manual`** → `SETTLED` immediately, fee booked (`WithdrawalFeeLedger::credit`).
- **Approve `monetapay`** → `ProcessWithdrawalPayoutJob` calls `createDisbursement`. A
  successful create only *accepts* the payout (create-response `status:0` = Processing), so
  the job leaves the row **`PROCESSING`** and books **no** fee yet. Job-`failed()` (create
  rejected / retries exhausted) refunds the hold and marks `FAILED`.
- **Final result is async**: `POST /disbursement/merchant/callback` (public, `throttle:webhooks`,
  `DisbursementCallbackController` → `HandleDisbursementCallbackAction`) decrypts+verifies the
  same way as the pay-in callback, then maps Monetapay `status`: `1`→`SETTLED` + fee booked,
  `2`→`FAILED` + hold refunded, `0`→stay `PROCESSING`. Idempotent — a row already terminal is a
  no-op, so retries never double-book a fee or double-refund. Covered by `WithdrawalTest` and
  `DisbursementCallbackTest`.

### uxiolabs (Product Supplier)

- Auth: a single `api_key` sent in every JSON request body (no signing, no dev/prod key split). The caller's server IP must additionally be whitelisted in the uxiolabs dashboard, or every call fails. **The allowlist is keyed on the IPv4 address, so `client()` pins `CURLOPT_IPRESOLVE` to v4** — left to itself curl prefers the AAAA record, the call goes out from an unlisted IPv6 address, and Cloudflare answers a "you have been blocked" HTML page that surfaces as a 502 on every price-list-backed endpoint.
- Endpoints (all POST JSON to `UXIOTOPUP_BASE_URL`, default `https://api.uxiotopup.id`): `/service` (price list), `/order`, `/status`, `/saldo`. Errors come back as HTTP 200 with `{status:false, msg}` — `UxiolabsService` rejects those envelopes rather than passing them through.
- `target` sent to uxiolabs = pipe-joined `target_uid|target_server` (just the uid when there is no server) — composed by `CustomerNumberFormatter` from `categories.order_form_fields` templates like `{user_id}|{zone_id}`.
- `invoice_number` is used as the uxiolabs `idtrx`. The order response's `data.id` is uxiolabs's OWN invoice and is persisted to `transactions.supplier_trx_id` — it is the only key `/status` accepts (there is no lookup by idtrx). `keterangan` carries the SN.
- `kontak` (phone) is required on `/order`: member phone → `guest_contact` → `'0000000000'` fallback.
- Duplicate `idtrx` ("idtrx sudah ada") means a previous attempt already placed the order — `UxiolabsDuplicateOrderException` is caught in `ProcessUxiolabsTransactionAction`, which settles the row to PROCESSING and waits for the callback instead of re-ordering or refunding.
- Supplier cost = the configured tier column from `/service` (`UXIOTOPUP_PRICE_TIER`: harga | harga_gold | harga_silver | harga_pro, default `harga`).
- Config keys: `services.uxiolabs.{api_key, base_url, callback_url, price_tier, callback_ips}`.
- Inbound webhook (`POST /v1/uxiolabs/callback`) carries **no signature** — authenticated only by source IP against `UXIOTOPUP_CALLBACK_IP` (comma-separated; default `103.146.202.50`). TrustProxies must be correct behind a LB or `$request->ip()` rejects every callback. Payload is flat: `{id, idtrx, keterangan, status, url_cb}`; statuses `pending|processing|paid` → PROCESSING, `success` → COMPLETED, `cancel|refund` → FAILED_PROVIDER (+refund).

### Discord (Operational Notifications)

- All Discord sends go through `App\Services\DiscordWebhookService` (`sendEmbed`/`sendAlert`) — never `Http::post` a webhook URL directly.
- Silently no-ops (and never throws) if `services.discord.webhook_log_url` is not set — safe to omit in dev.
- Used by: uxiolabs status transitions, the manual price-check report, refund claim alerts, and scheduler `onFailure` alerts.

---

## uxiolabs Price Checker & Manual Product Management

Core principle: **supplier cost is fact (auto-updated), selling price auto-follows the configured margin rules, products are never auto-created**. Full admin guide: `docs/uxiolabs-product-management.md`.

### 5-minute price checker

`uxiolabs:check-prices` (scheduled `everyFiveMinutes` in `routes/console.php`) runs `CheckUxiolabsPricesAction`:

- Fetches the price list (warming the shared cache `uxiolabs:price-list`, TTL 300s — `UxiolabsService::getPriceListCached()` / `findServiceInPriceList()` read it). `supplier_products.buyer_sku_code` stores the uxiolabs service `id`.
- Updates `supplier_products` cost/availability via chunked `upsert()` on `(supplier_id, buyer_sku_code)`. Availability = `status === "aktif"`, mirrored into both `buyer_product_status` and `seller_product_status`. Postpaid/pasca is gone — uxiolabs is prepaid-only.
- **Availability**: unavailable SKUs get `is_active = false` + `sync_deactivated_at` stamp; only stamped rows are ever auto-reactivated, so a manual admin deactivation is never overridden.
- **Provider-code verification (dual codes)**: the provider's own code is `supplier_products.buyer_sku_code` (the integration key, read-only, only ever sourced from the price list); the admin's own code is `products.code`. Because the key cannot be compared against itself, a changed provider code is detected by comparing each mapping's live `nama_layanan` against its stored `provider_name` snapshot, plus counting mapped SKUs that vanished from the price list. Any drift writes a **system log** row (`activity_logs`, `is_system = true`, "Verifikasi kode provider: …"), deduped per distinct drift via cache `uxiolabs:provider-code-drift` so a persistent drift is not re-logged 288×/day. NB: the global Activity Log feed filters `is_system = true` out — the row is for verification in the table/log, not the feed.
- **Cost changes auto-reprice** a LIVE mapped product (`product_id` set + `is_active`): selling prices are recomputed from the margin rules via `ProductRepricer` (shared with the manual "Uxiolabs Update" so the two never drift), `products.price_modal` follows cost, and a `price_change_logs` row is written. Pooled rows (no product) are never repriced/logged — their cost still updates and their preview prices move with it.
- **Nothing freezes a selling price.** `products.is_price_locked` is a leftover column no longer read (the admin "Lock Price" action was removed): a frozen price is what leaves a product selling below cost, and checkout then refuses the customer with *"Transaksi dibatalkan otomatis: harga modal supplier sedang naik."* The margin rules win. NB: the separate `supplier_products.is_price_locked` is a label/filter only and has never affected pricing.
- **The log states what was written, never what was computed.** `WriteProductPricesAction::fromCost()` returns the prices read back AFTER the write (per plan row, mapped onto the legacy tiers), and the status is derived from the old → new diff: `applied` (something moved), `unchanged` (the cost moved, the price did not), `negative_margin` (a billed tier is under cost), `deactivated`. `repricedCount` counts only rows whose price actually moved.
- **Needs-attention log rows**: `deactivated` (SKU went inactive at the provider) and `negative_margin`. The latter is evaluated per **plan row** plus any running flash sale — not against `products.price_member` alone, so a VIP/reseller tier under cost is no longer invisible until checkout refuses that one customer. Everything is append-only — a cost that moves twice leaves two rows; there is no dedupe/acknowledge.
- **One run at a time**: `CheckUxiolabsPricesAction::execute()` takes `Cache::lock('uxiolabs:price-check', 300)`. The scheduled command has `withoutOverlapping`, but the manual console command and `POST /v1/uxiolabs/sync-products` do not — without the lock two overlapping runs each wrote a log row for one real cost change. A skipped run returns a report with `skippedReason` set (the command exits 0 with a warning; the endpoint answers **409**).
- **Per-row isolation**: each reprice runs in its own savepoint + try/catch. One row that cannot be repriced is counted as `failed` (with `failed_skus_sample`) and left at its old price with NO log row — it no longer rolls back every other product onto the old cost. The end-of-run scan then flags it as `negative_margin` if it is below cost.
- **Never** creates products (unknown SKUs are only counted/sampled in the report).
- Report DTO: `PriceCheckReportDTO` (total_fetched, price_changed, repriced, unchanged, failed, negative_margin_count, deactivated_logged, deactivated/reactivated, negative_margin detail `{product,sku,cost,tier,price}`, unknown_count/sample, failed_skus_sample, provider_name_changed/changes, disappeared_count/sample, skipped_reason).

`uxiolabs:sync-products` (name kept; also `POST /v1/uxiolabs/sync-products`) is the **manual** run of the same action with a console table — it does not auto-create products.

Both runs post the same Discord report through `SendPriceCheckDiscordReportAction` (title marks the source: `terjadwal` / `manual`; green = nothing to do, orange = margin under cost / SKU switched off / a reprice that could not be written; a skipped run reports as such in blue). The **scheduled** run reports on every tick, 288 messages a day — deliberate, so the checker's log is in the channel rather than only on a crash. Quietening it later is a filter inside that one action, not a change to the commands.

### Manual product creation

- `GET /v1/uxiolabs/sku-preview` — previews a service from the cached price list (name/category/cost/availability, `already_mapped`, `suggested_prices` from `PricingService`).
- `POST /v1/products/from-supplier` — the Add Products modal pipeline (`AddProductsFromSupplierRequest` → `AddProductsFromSupplierAction`): each `items[]` row **requires** an admin-authored internal `code` (stored as `products.code`) and is never allowed to carry `buyer_sku_code` from input — the provider code comes only from the price list. SKUs whose provider `status != 'aktif'` are skipped with reason *"Layanan nonaktif di provider"*. Drafts unless `publish`.
- `POST /v1/uxiolabs/products` — `CreateUxiolabsProductAction`: creates Product (price_modal = uxiolabs tier cost) + SupplierProduct mapping; admin supplies all 4 selling prices. Business-rule failures throw `App\Exceptions\UxiolabsProductException` → 422.
- `POST /v1/uxiolabs/products/import` — Excel bulk import (`ImportUxiolabsProductsAction`, PhpSpreadsheet): headers matched by NAME on row 1 (`buyer_sku_code, category_code, name, code, price_member..price_agent, status`), max 500 rows, per-row validation + transaction so bad rows never abort the batch; blank prices default from `PricingService`.
- `GET /v1/uxiolabs/products/import-template` — generated xlsx (sheet "Produk" + "Petunjuk" with live category codes). **Binary response — intentional deviation from the ApiResponse envelope.**
- `GET /v1/uxiolabs/price-change-logs` — paginated read-only audit trail of the checker's actions (filters: `status` = applied|unchanged|locked|deactivated|negative_margin|all, `search` name/sku, `date_from`/`date_to`). `locked` is history only — rows written before the price lock was removed; nothing writes one now. Replaces the old manual price-alert acknowledge endpoints.

`products.auto_price` was **dropped** — category is always explicit admin input. `PricingService` + `pricing-rules` CRUD remain for suggested/default prices only (member 20 / vip 15 / reseller 10 / agent 5 % built-in fallback).

---

## Async Job: `ProcessUxiolabsTopup`

Dispatched by `HandleMonetapayCallbackAction` after a successful Monetapay payment. Configured with `$tries = 3`, `$backoff = 30` seconds.

Flow inside the job:
1. Sets Transaction → `PROCESSING`.
2. Calls `ProcessUxiolabsTransactionAction::execute(Transaction)` — places the `/order`, persists `supplier_trx_id`; a duplicate-idtrx reject is settled to PROCESSING (never retried/refunded, the callback finalises it).
3. On infrastructure exception: re-throws so the queue retries; `failed()` marks `FAILED_PROVIDER` + refunds after all retries are exhausted.

Queue driver is `database` by default (`QUEUE_CONNECTION=database`). Tests run with `sync`.

**The queue worker is not optional, and its failure is silent.** Eight job
classes depend on it, and this one places a paid customer's order with the
supplier — if the worker is down the payment succeeds, the job parks in `jobs`,
and nothing anywhere errors. Three things guard that, and all three must stay:

- `supervisor/api-prod-worker.conf` runs **two** processes. One is not enough:
  every job shares the queue and a supplier order is an outbound HTTP call that
  can hold a worker for seconds, so a Hub config poke would wait behind it.
- The deploy **fails** if the worker does not reach `RUNNING`, and if the
  scheduler cron is missing. Both checks used to end in `|| true`, which is how
  a site can run for days on green deploys while paid orders go nowhere.
- `queue:health` (scheduled every 10 min) alerts Discord when a *due* job has sat
  untouched for 5 minutes. It runs on the scheduler — a separate process from
  supervisor — so it can still speak when the worker cannot. It counts only
  overdue jobs on purpose: `PollUxiolabsStatusJob` re-schedules itself into the
  future, so a healthy queue is often far from empty.

---

## Service Billing (payment page)

A client (`payment-admin`) subscribes to a service kita sells. The bill is a
`service_invoices` row; **the payment is a separate `service_invoice_payments`
row, one per attempt.** They are separate because a bill outlives its payment —
a virtual account expires in 600s while `due_at` is three days out — so
re-opening a payment is the normal case, not an edge one.

- **`SRV-` is the third payable prefix.** `HandleMonetapayCallbackAction` routes
  by reference prefix before any lookup: `TOP-` → `balance_topups`, `SRV-` →
  `service_invoice_payments`, and the fall-through `PAY-` → `payments`. A new
  payable needs its own prefix and its own early-return branch; without one it
  falls into the checkout lookup, 500s, and Monetapay retries forever.
- **`ActivateServiceSubscriptionAction` is the only definition of "the client
  now has this service."** Both routes to paid call it — the webhook, and a
  payment-internal user marking a bill paid by hand — so the renewal-stacking
  rule cannot fork.
- **The manual confirm/reject stays** as the fallback for a webhook that never
  arrived or a client who paid outside the gateway.
- **Admin fee is the storefront top-up formula**: `fee_flat + round(amount ×
  fee_percent/100)`, added on top and frozen onto the attempt. The bill's
  `amount` never changes.
- **The wallet channel cannot pay a service bill.** A merchant's settlement
  balance is money kita owes it, not a way to pay kita back.
- **`service-payments:sync-expired`** (every 5 min) sweeps stale attempts.
  `payments:sync-expired` cannot: it joins `whereHas('transaction')` and a
  service payment owns no transaction. Its recovery half matters — a client
  whose webhook was lost has genuinely paid.
- `OpenServiceInvoicePaymentAction` keeps `redirect_url`/`deeplink_url`, which
  `CheckoutAction`'s instruction filter drops — they are the only output of
  `createTransaction`'s e-wallet branch.
- `ServiceInvoiceStatus::WAITING_CONFIRMATION` is legacy: nothing produces it
  since the bukti-transfer flow was removed, but old rows still carry it.
- Covered by `tests/Feature/PaymentPage/ServiceInvoicePaymentTest.php` and
  `ServiceInvoiceWebhookTest.php` — the latter is the **only** Monetapay callback
  coverage in the repo; copy its envelope builder rather than re-deriving the
  signature.

---

## Image Uploads

Every image goes to disk through `App\Services\ImageOptimizer::store($file, $directory)` — the drop-in
replacement for `$file->store($dir, 'public')`. It returns the same relative path, so model columns,
`MediaUrl::for()` and the delete-the-old-file logic are unaffected.

- **Output is WebP**, quality 82, longest edge capped at 1920px (never upscaled), EXIF rotation baked in,
  alpha preserved. Tuned in `config/images.php` (`IMAGE_OPTIMIZE_ENABLED`, `IMAGE_WEBP_QUALITY`,
  `IMAGE_MAX_DIMENSION`, `IMAGE_MAX_MEGAPIXELS`) — no code change needed to retune.
- **It degrades, never fails.** SVG/ICO/PDF, animated GIFs, already-small WebP, absurd pixel counts, a GD
  without WebP, and any thrown error all fall back to storing the original bytes (with a log line for the
  failure paths). An upload must never 500 because the optimiser could not do its job.
- **Payment proofs are excluded on purpose** — `ManualReviewTransactionAction`,
  `MerchantServiceInvoiceController::uploadProof` and `FinanceWithdrawalController::approve` still call
  `->store()` directly. Proof is evidence; it is kept byte-for-byte as the customer submitted it. Do not
  "tidy" those three into the optimiser.
- Existing images are **not** backfilled; only new uploads are converted. Both extensions coexist fine
  because the path is read from the database.
- Requires the `gd` extension (and `exif` for JPEG orientation) — both are in the CI workflows' extension
  list, and `UploadedFile::fake()->image()` already depends on GD.
- Behaviour is pinned in `tests/Unit/ImageOptimizerTest.php`; the endpoint wiring in
  `tests/Feature/ImageUploadWebpTest.php`.

The browsers help but do not guarantee: `uxiotopup-admin` and `uxiotopup-fe` re-encode to WebP client-side
before uploading (same rules, same skips) so a phone photo does not have to travel as several MB. Anything
they skip is still handled here.

---

## Key Database Relationships

```
users (nullable) ──── transactions ──── payments ──── payment_channels
                           │
                     products ──── supplier_products ──── suppliers
                           │              │
             point_histories, ratings   price_change_logs
```

- `transactions.user_id` is nullable — guest checkouts are supported.
- `transactions.guest_contact` stores the WhatsApp/phone number for guests, canonical E.164 (see **Phone numbers**).
- `products.price_modal` is cost; `products.price_member` is the **denormalised default-plan price** kept for sorting and filtering. Real selling prices live in `product_plan_prices` (one row per product × plan). `price_vip`/`price_reseller`/`price_agent` are frozen legacy columns, no longer written — see **Membership-plan pricing**.
- `payment_channels` carries three independent rates, all applied by `CheckoutAction` and all
  **frozen onto the transaction and payment rows at checkout** so a later rate change never
  rewrites a booked order:
  - `fee_flat` + `fee_percent` → the channel fee. This **is** the "Biaya Admin" the customer
    is charged (`amount_fee`/`channel_fee`); there is no second global markup. `admin_markup`
    is always written as `0` and is kept only so historical rows stay reconstructable.
  - `gateway_fee_flat` + `gateway_fee_percent` → Monetapay's own cut of the gross, recorded on
    `payments.gateway_fee` rather than read back from the callback. Settlement
    (`SettleMerchantTransactionAction`) reads it straight off the payment row.
  - `tax_percent` → PPN levied **on the channel fee only**. It is kita's expense, so it reduces
    platform profit at settlement and is deliberately **not** added to what the customer pays
    (`amount_total` is unchanged by it).
  So: customer pays `selling_price + channel_fee`; kita keeps `channel_fee - gateway_fee - tax_amount`.
- `supplier_products.is_active` is the gate — only the first active record is used per product.

---

## Public vs Protected Routes

Three tiers, all under `/api/v1`:

1. **Public** — the customer-facing storefront plus the gateway callbacks. `POST /v1/checkout`, `POST /v1/payment/callback` and `POST /v1/uxiolabs/callback` were always public; the storefront read endpoints below joined them.
2. **`auth:sanctum`** — `GET /v1/user`, `PATCH /v1/users/sync-timezone` and the whole `/v1/me/*` group. Any authenticated user.
3. **`auth:sanctum` + `admin`** — everything else (the back-office CRUD).

### Storefront API (public)

Consumed by the React client in `uxiotopup-fe`. Handlers resolve the caller with `$request->user('sanctum')` so a signed-in member gets their tier price, while guests still work.

| Endpoint | Notes |
|---|---|
| `GET /v1/games` | Sellable games only. `search`, `type_id`, `sort=name\|popular`, `per_page` |
| `GET /v1/games/{game}` | `{game}` binds via `Catalog::resolveGame` — slug, code **or** id. Includes `order_form_fields` |
| `GET /v1/games/{game}/products` | Denominations priced through `RolePrice` — the same ladder `CheckoutAction` charges |
| `GET /v1/games/{game}/reviews` | Paginated ratings + star breakdown; author + game id masked |
| `POST /v1/games/{game}/validate-id` | Nickname lookup. **Always 200** — see below |
| `GET /v1/payment-channels` | `balance` excluded for guests (checkout rejects it for them anyway) |
| `GET /v1/price-list` | `game` accepts a slug/code, not an id |
| `GET /v1/invoices/{invoiceNumber}` | Public receipt, polled every 5s. Narrow projection |
| `GET /v1/orders/track?query=` | Invoice number or exact phone. `throttle:checkout` |
| `GET /v1/storefront/{banners,announcements,leaderboard}` | **Prefixed on purpose** — `/v1/banners`, `/v1/announcements` and `/v1/leaderboard` are already admin routes, and Laravel's route collection is keyed on method+uri, so a same-path public route would silently replace the admin one |

Key invariants:

- **Never widen the public projections.** `ShowInvoiceAction`, `TrackOrdersAction` and `ListMemberTransactionsAction` build their arrays field-by-field rather than serializing a model, so `guest_contact`, `margin`, `price_modal` and supplier ids cannot leak by accident. Tests assert this.
- **`validate-id` must never fail a purchase.** Unconfigured game, unrecognised provider, provider timeout and provider 500 all resolve to `{nickname: null}` with a 200. A 4xx here would read on the client as a broken order form.
- **`Catalog` is the single definition of "sellable"** (active product + active supplier mapping). `TopupPageController` and every storefront endpoint go through it, so the catalog can never advertise an order checkout would reject.
- **`PaymentExpiry`** holds the per-channel expiry windows, shared by `payments:sync-expired` and the invoice endpoint's `expires_at`. Splitting them would let the customer's countdown disagree with the job that reaps the payment.
- **`CheckoutAction` persists the gateway instructions** into `payments.payment_data`. Without it the QR/VA exists only in the checkout response and a page refresh leaves the customer with nothing to pay against.
- **`POST /v1/checkout` has no auth middleware**, so `$request->user()` consults the `web` guard and cannot see a bearer token. `StoreCheckoutRequest::checkoutUser()` resolves through the `sanctum` guard instead — without it a signed-in member is booked as a guest and locked out of balance payment. `Sanctum::actingAs()` masks this in tests; the regression test in `StorefrontOrderTest` uses a real bearer header on purpose.

### Member self-service (`/v1/me`)

`GET|PUT /v1/me`, `PUT /v1/me/password`, `GET /v1/me/dashboard`, `GET /v1/me/transactions`, `GET /v1/me/activity-logs`, `POST /v1/me/transactions/{invoiceNumber}/rating`.

Every query is scoped to `user_id` **before** any filter is applied, so no filter combination can widen it to another customer's rows. The rating route is keyed on `invoice_number` — the only order identifier the storefront holds — and resolves inside the caller's own transactions, so someone else's invoice is indistinguishable from one that does not exist.

### Auth

`POST /v1/auth/register` always assigns the MEMBER role; role is never settable from the request body. `forgot-password` returns the same message whether or not the email exists (no `exists` rule, no differing response) so it cannot be used to enumerate accounts. `reset-password` revokes all existing tokens — a reset is the recovery path after a compromise.

## Uxio Hub Integration (multi-site)

This codebase is deployed once per client site; the **Uxio Hub**
(`uxiotopup-hub-api` + `uxiotopup-hub` panel) oversees all of them. **Data only
ever moves on a GET the receiver made itself** — but that is not the same as
"no write endpoints", and the difference matters: this site POSTs service orders
up to the Hub, and the Hub POSTs two kinds of instruction down (a sync poke, and
the money-path actions). A standalone deployment (`HUB_ENABLED=false`, the
default) schedules nothing, calls nowhere, exposes nothing.

- **Reporting contract (Hub pulls us):** `GET /v1/hub/{summary, withdrawals,
  service-orders, profit, channels}` — read-only, gated by `X-Hub-Key`
  (+ optional IP allowlist) via the `hub` middleware; dead when no key is
  configured. **ADDITIVE-ONLY:** sites run mixed deploy versions, so fields
  may be added but never renamed/removed — shapes pinned in
  `tests/Feature/Hub/HubReportEndpointsTest`.
- **We pull the Hub:** `hub:sync-catalog` and `hub:sync-channels` (every 15
  min when enabled). Catalog sync matches services by `code`, NEVER deletes
  (only deactivates — service FKs cascade), never touches `cost_price` (the
  Hub's private margin data, absent from the payload) or the local
  `payment_channel_id`. Channel sync matches by `channel_code` and writes the
  fee columns plus `is_active` and `min_amount`. An error envelope aborts the
  sync rather than emptying the catalog.
- **Channel sync CREATES a channel the site has never seen**, from the `name` +
  `payment_type` the Hub now sends, so a new payment method rolls out to five
  sites from one form. Two rules keep that from breaking checkout from an admin
  panel: it is only created **active** if the `channel_code` exists in
  `MonetapayContractFees::CONTRACT` (an unlisted code is one `MonetapayService`
  would send raw to the gateway AND one `MerchantBalance` settles at T+0, i.e.
  withdrawable before Monetapay released it), and `payment_type` is taken on
  CREATE only — it picks the gateway endpoint, and the `match()` there falls
  through to `virtual_account`, so a Hub typo would misroute a live channel
  rather than error. Rows the sync writes are flagged `hub_managed`.
- **The Hub pokes us:** `POST /v1/hub/sync` (middleware `hub` + `throttle:hub-sync`,
  read key only) carries no data — we run the same pulls the scheduler runs, so a
  Hub edit lands in about a second instead of a minute. Deliberately NOT behind
  `hub-write`: that gate exists so a leaked read key cannot move money, and
  requiring it here would couple fast fee updates to `HUB_WRITE_ENABLED`.
  **It runs INLINE and answers with `applied`.** It used to queue `RunHubSyncJob`,
  which made a config change depend on this site's worker being alive — and when
  it was not, the Hub saw its 202, logged a green row, and the fee sat unchanged
  with nothing anywhere reporting a problem. The work is two GETs and a handful of
  upserts, so there was never much to defer, and the response now IS the
  confirmation. A failed pull answers **200 with `applied: false`**, never a 4xx:
  reaching us and applying are different facts, and the Hub records them in
  different columns. `RunHubSyncJob` is retired to drain in-flight jobs and to
  keep answering a Hub that is a release ahead — delete it once every site is past
  this release, the same treatment `RefundGatewayJob` got before it was deleted.
- **The Hub raises an internal withdrawal:** `POST /v1/hub/internal-withdrawals`
  (`hub` + `hub-write`) wraps the SAME `CreateInternalWithdrawalRequestAction`
  the payment-internal panel uses, attributed to `HubSystemUser` — so the
  `platform_accounts` lock and the "saldo tidak mencukupi" guard are one
  implementation, not a second copy that could drift more permissive. Unlike its
  approve/reject siblings it CREATES rather than transitions, so it is made
  idempotent by `withdrawals.idempotency_key` (unique): replaying a key returns
  the ORIGINAL row instead of withdrawing twice. The lookup sits **before** the
  balance check, so a replay still resolves once the balance it spent is gone —
  otherwise a retry would read "saldo tidak mencukupi" about money that already
  left. A replay also skips the finance notification: nothing new happened.
  `GET /v1/hub/withdrawal-context` (read key only — it changes nothing, and a
  site with the write channel off still deserves to show a balance) feeds the
  Hub's form its available balance, fee, floor and `BankCatalog`; the Hub must
  not carry its own copy of any of the four.
- **Hub-managed guards:** with `HUB_MANAGED_CATALOG`/`HUB_MANAGED_CHANNELS`,
  the local service-catalog writes 422 (`catalog-local` middleware) and
  `ChannelFeeController` rejects every field for a channel the Hub actually
  syncs (`payment_channels.hub_managed`) — a local edit would be silently
  overwritten. Scoped per row on purpose: the Hub's master holds only the
  Monetapay-contracted codes, so `balance` and `payment_link` are not in it and
  would otherwise be editable nowhere. `GET /v1/payment-internal/channels/meta`
  lets the panel grey the inputs out instead of refusing on save.
- **Withdrawal holding period:** `MerchantBalance` splits paid sales into
  settled vs held — a sale is withdrawable only after its channel's Monetapay
  settlement window (`MonetapayContractFees::settlementDays`) plus
  `WITHDRAWAL_HOLD_BUFFER_DAYS` (default 1). Dashboard exposes
  `saldo_tertahan`. Test fixtures that seed paid sales must backdate
  `created_at` past the longest hold (5 days) or the balance reads 0.
- BCA VA is gone from this site — the gateway does not offer it. No seeder row,
  no `MonetapayContractFees` entry, and `2026_09_22_000002_remove_bca_va_channel`
  deletes any leftover row (leaving it deactivated instead when transactions or
  other money paths reference it). Absence from the contract is also what stops
  `hub:sync-channels` re-creating it.
- `GET /v1/hub/balances` reports this SITE's merchant figures by our sales rules —
  `merchant_available` (settled sales − withdraw-hold), `merchant_held`,
  `sales_total`, `withdrawn_hold` — beside the platform's own
  `platform_available`. It makes no gateway call (settlement is a ledger
  question), and the Hub reads a 404 from an older deploy as unknown, never as
  zero.
- Monetapay balance cache is keyed per `(sub_mch_id, currency)` —
  `MonetapayService::balanceCacheKey()` is the shared key helper for
  cache-busting callers, and with no argument it resolves the configured
  sub-merchant. Never key it off an **app id**: that names an entry nothing
  writes, and the read silently falls through to the snapshot.

### The Hub owns this site's licence (and can switch it off)

`hub:sync-licence` (every **1** minute, sharing the single Hub tick with the
catalog, channel and plan pulls because this one decides whether the site
serves) pulls `GET /api/v1/sites/licence`
and `ApplyHubLicenceAction` lands it in two places:

- **The gate** — private `Setting`s in group `licence`, read through
  `App\Support\SiteLicenceState` (cached 60s) by `EnsureSiteIsServing`.
- **The term** — ONE `ServiceSubscription` row for `DefaultMerchant` +
  `WebsiteService`, `service_invoice_id = null`, `source = 'hub'`, updated in
  place. That is what makes the admin sidebar card and the client's "Langganan
  Saya" tab show it **with no new read path**; renewals stack at the Hub, and
  stacking the mirror too would double-count against the `MAX(ends_at)` every
  reader uses.

Rules that are load-bearing:

- **`EnsureSiteIsServing` is the only globally appended middleware in this app,
  and it is global on purpose.** Per-group would mean a public route added later
  silently escapes the gate, and a kill switch with a hole in it is not a lever.
  The exceptions are listed in the class, and
  `tests/Feature/Hub/SiteAvailabilityTest` pins the **exact** unauthenticated
  exempt set — never widen that list to make a test pass.
- **What must never be gated:** `v1/hub/*` (the Hub could not switch the site
  back on), `v1/auth/*` and the admin / payment-admin / payment-internal groups
  (the client has to reach the panel where they pay), the gateway callbacks
  (money in flight, and the path a renewal arrives on), and
  `v1/storefront/settings` (the down-page renders the client's own branding).
- **Dark by default; an unreachable Hub changes nothing.** A site with no synced
  answer at all is CLOSED — "never provisioned" is not "allowed" — so a fresh
  deployment (or one whose key is wrong) answers 503 on every public route until
  the Hub first says it may serve. After that, the last synced answer STANDS: a
  Hub outage cannot darken five storefronts, because nothing rewrites the stored
  answer. There is deliberately **no amnesty** after N hours of silence — that
  would teach a delinquent client that blocking the Hub revives their site.
- **`services:expire` will flip the hub row to EXPIRED overnight** once the term
  lapses. The sync resets `status` to ACTIVE on renewal; without that a paid-up
  site stays dark, because the sidebar card counts only ACTIVE rows.
- **A client renewing here reports it up.** `ActivateServiceSubscriptionAction`
  dispatches `PushLicenceRenewalJob` when the service bought is this site's own;
  the Hub is idempotent on the invoice number. There is no pull-based backstop
  for this one, so a permanent failure alerts Discord — an operator extending
  the term by hand is the fallback.
- **Rollback is `HUB_MANAGED_LICENCE=false`**: the gate goes inert, the sync
  stops writing, and the local subscription rows keep working as before.

### The Hub's service plan (this site issues the bills)

`hub:sync-plan` (every 1 minute, behind **`HUB_MANAGED_PLAN`**, off by default)
pulls `GET /api/v1/sites/plan` and `ApplyHubPlanAction` turns each published
period into one of this site's own `service_invoices`. The Hub decides WHAT is
owed and WHEN it becomes payable; this site issues the bill, collects through its
own Monetapay sub-merchant, and reports back the way it always did.

- **`service_invoices.billing_mode` decides what paying the bill DOES.**
  `billed` opens a subscription window as always; `one_time` (a setup fee)
  settles the bill and stops — no subscription, no installation, and no licence
  extension, or the client would get a free period out of a fee. Null on rows
  issued before the column, which were all `billed`.
- **Licence renewal follows the plan's `governs_licence` flag**, not just the
  website service code: `PushLicenceRenewalJob` dispatches when the bill's
  `hub_item_key` names a line the Hub marked as governing (falling back to the
  service code for a bill with no plan item behind it — a client buying their own
  subscription). Without that, marking any other service as the governor stored a
  flag nothing acted on. A `one_time` fee never renews anything.
- **`service_invoices.hub_item_key` is unique, and that is the whole guarantee.**
  It names one period of one plan line (`<plan ulid>:<period index>`). Not a date
  comparison, not a status check — an index, which is why a sync running every
  minute forever issues exactly one invoice per period, and so does a
  sync racing itself. NULL on every locally raised bill, and both MySQL and
  SQLite treat NULLs as distinct, so the "Langganan" flow is untouched.
- **Bill the Hub's `amount`, never `services.selling_price`.** The plan carries
  the per-site NEGOTIATED price; billing from the local catalog would silently
  charge every client who negotiated a price the list price instead, on every
  renewal, forever. `HubPlanSyncTest` seeds the two differently on purpose.
- **`services:expire` skips `source = 'hub_plan'`.** A bill a client abandoned
  should close; one kita issued on a schedule must not, because against a unique
  key that is a one-way door — the period could never be re-issued and the client
  would have no way to pay for a service they still hold.
  `ApplyHubPlanAction::reopenIfStranded()` heals rows closed before that
  exclusion shipped, and reopens **EXPIRED only**: CANCELLED and REJECTED were
  decisions somebody made.
- **A prepaid period NEVER touches a ledger.** `ServiceRevenueLedger` writes
  `platform_ledger`, which drives `PlatformBalance::available()` — money kita can
  *withdraw*, and the figure the Hub's reconciliation page compares against the
  real Monetapay balance. Prepaid money never entered the sub-merchant. It is
  still counted where that is honest: `summary.paid_service_invoices_this_month`
  sums PAID `service_invoices.amount`, so the invoice alone is enough.
- **A prepaid period must not go through `ActivateServiceSubscriptionAction`.**
  That dispatches `PushLicenceRenewalJob`, which for the website service would
  ask the Hub to extend the term a SECOND time on top of the one it granted from
  that very prepaid line at registration — a free year. It would also stack on
  `MAX(ends_at)` instead of honouring the operator's start date.
- **`ApplyHubLicenceAction` still owns the `source='hub'` row for the website
  service, alone.** Its `updateOrCreate` key is scoped by `service_id`, so the
  plan's rows cannot collide with it — but the plan deliberately writes no
  subscription for that one code. Two writers would double-count against the
  `MAX(ends_at)` every reader uses. There is now more than one `source='hub'`
  row on a site (one per prepaid service); the index was never unique.
- The poke still arrives as target **`licence`**, not a new `plan` target:
  `HubSyncTriggerController` validates `targets.*` with an `in:` rule, so an
  unknown target 422s the WHOLE poke on any site a release behind. `plan` is
  accepted here already; the Hub may start sending it once every site is past
  this release.
- Rollback is `HUB_MANAGED_PLAN=false`: nothing new is pulled, nothing new is
  issued, and every invoice already issued keeps working.
- `hub_plan_items` caches what the Hub said. It is what lets the payment page
  show "what you must renew" with no live Hub call, and what keeps billing
  working through a Hub outage — which would otherwise quietly mean nobody gets
  billed while the Hub is down.
- **The licence line the client sees is not just the subscription lookup.** For
  the site's OWN licence, `MerchantServiceController::plan()` takes the paid
  state from the Hub's verdict (`SiteLicenceState`) as well, beside the
  `ServiceSubscription` rows: the mirror row lands on `DefaultMerchant` +
  `WebsiteService`, and any mismatch there (service code or merchant) used to
  make a licence the client had PAID FOR read "Belum pernah dibayar" on the one
  screen that should confirm it. Keyed on the resolved licence code, so a retired
  `item_key` still flagged `governs_licence` is not mistaken for it. A `one_time`
  line carries a numeric `duration_days` (the catalogue default, 365 for the
  website) but bills once — the payment page shows "Sekali bayar" and never
  "/365 hari"; only a recurring line has a period.

### One payment, several bills

`service_invoice_payments` may now cover N invoices. The bills stay
one-per-service — each buys its own period — and the PAYMENT is what spans them
(`POST /v1/payment-admin/service-invoices/pay-batch`).

- **`service_invoice_payment_items` is the authority**, not
  `service_invoice_payments.service_invoice_id`, which is nullable and populated
  only for a single-invoice attempt. Every reader goes through the pivot. The
  alternative — keeping the FK and letting one invoice be an "anchor" — is a
  schema that lies: `amount`/`admin_fee`/`total` on the attempt are the BATCH's,
  and the first query joined on the FK (as `UnifiedTransactionQuery` was) reports
  the whole batch total against one bill in a screen the client reads.
- **The channel fee is charged ONCE on the sum.** `fee_flat` per invoice would be
  a plain overcharge on every batch. Each item's share is apportioned and
  **stored** when the attempt opens, with the rounding remainder pushed onto the
  first row, and the action throws if the shares do not sum to the fee exactly.
  Never recompute a share at read time.
- **Opening any attempt expires every PENDING attempt that overlaps ANY of its
  bills.** Two live payables for one bill means the client can pay twice, and
  there is no refund path for a service invoice anywhere in this app.
- The callback and `service-payments:sync-expired` both loop the pivot in
  ascending invoice id, so two concurrent batches sharing a bill queue rather
  than deadlock.
- **`ServiceRevenueLedger` is credited ONCE per attempt, for the sum of the
  BILLS.** One reference keeps it idempotent; N would risk a partial credit
  behind a crash. The amount changed with this release: the webhook used to
  credit `attempt->total`, which includes the channel fee — money that buys the
  gateway's cut and is not withdrawable income — while the manual confirm has
  always credited `invoice->amount`. The two now agree. Historical rows are not
  backfilled.

### `GET /v1/hub/gateway-balance` — a live reading, deliberately apart

`HubReportController::gatewayBalance()` (feeding `/summary`) is cache-only and
must stay that way: Monetapay's inquiry timeout is 15s, the same as the Hub's
pull timeout, so a live call there hangs every mirror in the fleet.
`liveGatewayBalance()` is the separate door, with its own `throttle:hub-balance`
limiter. It uses `inquiryBalanceCached`, so a Hub balance pull WARMS the figure
`/summary` reads instead of leaving a staler one beside it, and `?force=1` busts
that entry. It answers **200 with `ok: false`** on failure, never a 5xx — the
same reasoning as the poke's `applied: false`.

`GET /v1/hub/subscriptions` reports what this site's owner holds per service,
collapsed to `MAX(ends_at)`. Both routes are in `SiteAvailabilityTest`'s exact
exempt list.

### The site's own name, not the Hub's

`hub:sync-catalog` rewrites `services.name` every minute, so the website
service cannot be renamed locally — it is "Uxiolabs" at the Hub because that is
what kita sells. But the client's panels are the client's own product.
`WebsiteService::label()` resolves the display name from
`payment.website_service_label` → `general.site_name` →
`services.storefront.brand`, and `WebsiteSubscriptionStatus` +
`ServiceSubscriptionResource` use it **for that one service code only**. The
rest of the catalog keeps the Hub's names.

## Required `.env` Keys Beyond Laravel Defaults

```
MONETAPAY_MCH_ID=
MONETAPAY_DISBURSEMENT_APP_ID=   # separate app_id for payout/disbursement (7.x); defaults to MONETAPAY_MCH_ID
MONETAPAY_PARTNER_KEY=
MONETAPAY_TOKEN=
MONETAPAY_AES_KEY=
MONETAPAY_AES_IV=
MONETAPAY_IS_PRODUCTION=false
MONETAPAY_SUCCESS_REDIRECT_URL=   # redirect after successful e-wallet / payment link payment
MONETAPAY_FAILED_REDIRECT_URL=    # redirect after failed payment link payment (optional)

WITHDRAWAL_FEE_FLAT=1500          # withdraw fee = flat + round(amount * percent/100); nett = amount - fee
WITHDRAWAL_FEE_PERCENT=11
WITHDRAWAL_MIN_AMOUNT=10000       # floor on the requested amount so nett stays positive
WITHDRAWAL_HOLD_BUFFER_DAYS=1     # fraud buffer on top of each channel's settlement (T+n)

HUB_ENABLED=false                 # Uxio Hub integration; false = standalone, nothing scheduled/exposed
HUB_SITE_API_KEY=                 # per-site key issued by the Hub, shown once at registration
HUB_BASE_URL=                     # the Hub API root, e.g. https://hub.uxiotopup.id
HUB_ALLOWED_IPS=                  # optional source-IP allowlist for the Hub's pulls
HUB_MANAGED_CATALOG=true          # local catalog writes 422 while the Hub owns the catalog
HUB_MANAGED_CHANNELS=true         # local edits 422 for Hub-synced channels (fees + is_active + min_amount)
HUB_MANAGED_LICENCE=true          # the Hub owns this site's licence AND can switch the public side off.
                                  # Set false to roll the whole kill switch back — the gate goes inert.
HUB_PUSH_ORDERS=                  # real-time service-order push to the Hub; defaults to HUB_ENABLED.
                                  # Leave UNSET — an empty value reads as false and silently disables it.
HUB_WRITE_ENABLED=false           # money-path write channel (Hub approving/raising withdrawals, confirming invoices)
HUB_WRITE_API_KEY=                # the SECOND key that channel needs; minted per site in the Hub panel

UXIOTOPUP_API_KEY=
UXIOTOPUP_BASE_URL=https://api.uxiotopup.id
UXIOTOPUP_CALLBACK_URL=        # points at {app}/api/v1/uxiolabs/callback; sent on every /order
UXIOTOPUP_PRICE_TIER=harga     # harga | harga_gold | harga_silver | harga_pro
UXIOTOPUP_CALLBACK_IP=103.146.202.50   # webhook source-IP allowlist (comma-separated)

DISCORD_WEBHOOK_LOG_URL=   # optional
```
