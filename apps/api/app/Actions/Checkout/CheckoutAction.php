<?php

namespace App\Actions\Checkout;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Points\GrantTransactionPointsAction;
use App\Actions\Settlement\SettleMerchantTransactionAction;
use App\Actions\Storefront\ValidateGameIdAction;
use App\Actions\Transaction\SendTransactionReceiptAction;
use App\Actions\Uxiolabs\ProcessUxiolabsTransactionAction;
use App\Contracts\PaymentGateway;
use App\DTOs\Checkout\CheckoutDTO;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Enums\PaymentStatus;
use App\Enums\TransactionStatus;
use App\Models\Payment;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Promo;
use App\Models\PromoRedemption;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use App\Support\Membership\MembershipResolver;
use App\Support\Money;
use App\Support\OrderForm\OrderFormSchema;
use App\Support\Payment\DefaultMerchant;
use App\Support\Points\PointLedger;
use App\Support\Points\PointRules;
use App\Support\Pricing\PlanPrice;
use App\Support\Promo\PromoResolver;
use App\Support\Stock\DailyStockLimit;
use App\Support\Wallet\WalletLedger;
use Exception;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CheckoutAction
{
    public function __construct(
        private readonly ProcessUxiolabsTransactionAction $uxiolabsAction,
        private readonly CreateActivityLogAction $logAction,
        private readonly PaymentGateway $monetapayService,
        private readonly SendTransactionReceiptAction $sendReceiptAction,
        private readonly SettleMerchantTransactionAction $settleAction,
        private readonly ValidateGameIdAction $validateGameIdAction
    ) {}

    public function execute(CheckoutDTO $dto): array
    {
        // Duplicate-submit guard: an identical checkout within 15s (double-tap,
        // client retry) is rejected instead of creating a second transaction.
        // Cache::add is atomic; the key is released on failure so the customer
        // can retry immediately after a rejected attempt.
        $identity = $dto->userId ?? $dto->guestContact ?? request()?->ip() ?? 'anon';
        // Every identifier takes part: two orders for the same product that differ
        // only in the third id are not the same order.
        $identifiers = $dto->orderFields !== []
            ? implode('|', $dto->orderFields)
            : $dto->targetUid.'|'.$dto->targetServer;
        $dedupeKey = 'checkout:dedupe:'.md5($identity.'|'.$dto->productId.'|'.$dto->paymentChannelId.'|'.$identifiers);

        if (! Cache::add($dedupeKey, 1, 15)) {
            throw new Exception('Permintaan duplikat terdeteksi. Mohon tunggu beberapa detik sebelum mencoba lagi.');
        }

        try {
            return $this->process($dto);
        } catch (Exception $e) {
            Cache::forget($dedupeKey);
            throw $e;
        }
    }

    private function process(CheckoutDTO $dto): array
    {
        // ── 1. Resolve entities (reads only — no transaction, no lock held) ──
        $user = $dto->userId ? User::with('role')->find($dto->userId) : null;
        $product = Product::with([
            'supplierProducts' => fn ($q) => $q->where('is_active', true),
            'category',
            'subCategory',
        ])->findOrFail($dto->productId);

        if (! $product->status) {
            throw new Exception('Produk sedang tidak tersedia.');
        }

        // ── The identifiers, in one shape from here on: key ⇒ value ──────────
        // A game may declare more than the two mirrored columns; that arrives
        // keyed. The legacy positional pair is widened into the same map, which
        // is also why its extra fields come out empty — and why the request
        // refuses that combination for such a game before reaching this point.
        $schema = OrderFormSchema::forCategory($product->category);

        $targetValues = $dto->orderFields !== []
            ? ($schema?->bound($dto->orderFields) ?? $dto->orderFields)
            : ($schema?->valuesFromPositional($dto->targetUid, $dto->targetServer) ?? []);

        // The two mirrored columns still feed the invoice, the receipt, the
        // WhatsApp message and the member list, so they hold the first two.
        $uidKey = $schema?->keyAt(0);
        $serverKey = $schema?->keyAt(1);

        $targetUid = $uidKey !== null ? ($targetValues[$uidKey] ?? '') : $dto->targetUid;
        $targetServer = trim($serverKey !== null ? ($targetValues[$serverKey] ?? '') : (string) $dto->targetServer);
        $targetServer = $targetServer !== '' ? $targetServer : null;

        $channel = PaymentChannel::where('is_active', true)->findOrFail($dto->paymentChannelId);

        // Only VA / e-wallet / QRIS are offered; `balance` is the member
        // wallet (a different, allowed path below). Reject anything else even
        // if a stray active row is targeted directly — the list already hides
        // these, this stops a hand-crafted request.
        if ($channel->channel_code !== 'balance'
            && ! in_array($channel->payment_type, PaymentChannel::ALLOWED_STOREFRONT_PAYMENT_TYPES, true)) {
            throw new Exception('Metode pembayaran ini tidak tersedia. Silakan pilih VA, E-Wallet, atau QRIS.');
        }

        // ── 2. Guest guards ──────────────────────────────────────────────────
        if (! $user && $channel->channel_code === 'balance') {
            throw new Exception('Saldo internal hanya untuk member. Silakan login atau pilih metode pembayaran lain.');
        }
        if (! $user && empty($dto->guestContact)) {
            throw new Exception('Nomor WhatsApp/Kontak wajib diisi untuk pelanggan tamu.');
        }

        // ── 3. Membership-plan price ─────────────────────────────────────────
        // Shared with the public catalog so the quoted price and the billed
        // price come from one implementation. Guests resolve to the default
        // plan, which is the free tier every account starts on.
        $sellingPrice = PlanPrice::for($product, $user);

        // ── 4. Supplier & margin guard ───────────────────────────────────────
        // A mix has no supplier of its own — it is delivered by its components —
        // so its cost is the ACCUMULATED component cost and its availability is
        // the availability of every part. A normal product keeps the original
        // single-mapping path exactly as it was.
        $activeSupplier = $product->supplierProducts->first();

        /** @var Collection<int, array{product: Product, mapping: SupplierProduct}> $quotaTargets */
        $quotaTargets = collect();

        if ($product->isMix()) {
            $items = $product->mixItems()->with('component')->get();

            if ($items->isEmpty()) {
                throw new Exception('Produk mix ini tidak punya komponen.');
            }

            foreach ($items as $item) {
                $component = $item->component;
                $mapping = $component?->supplierProducts()->where('is_active', true)->first();

                // One unusable part means the mix cannot be delivered at all, so
                // it is refused here rather than discovered at fulfilment.
                if (! $component || $component->trashed() || ! $component->status || ! $mapping) {
                    throw new Exception('Ada komponen mix yang sedang tidak tersedia.');
                }

                $quotaTargets->push(['product' => $component, 'mapping' => $mapping]);
            }

            $cost = (int) $items->sum(fn ($item) => $item->cost());
        } else {
            if (! $activeSupplier) {
                throw new Exception('Produk sedang tidak tersedia (tidak ada supplier aktif).');
            }

            $quotaTargets->push(['product' => $product, 'mapping' => $activeSupplier]);
            $cost = (int) $activeSupplier->price;
        }

        $margin = $sellingPrice - $cost;
        if ($margin < 0) {
            throw new Exception('Transaksi dibatalkan otomatis: harga modal supplier sedang naik.');
        }

        // ── 4a. The day's allowance ──────────────────────────────────────────
        // A LOCAL quota, not the provider's stock — uxiolabs reports no quantity
        // and has no availability probe. Checked here so an exhausted SKU fails
        // before the gateway is called, and again under a row lock inside the
        // write transaction, which is what actually stops two simultaneous
        // orders from taking the same last slot. A mix checks every component,
        // because each carries its own quota.
        foreach ($quotaTargets as $target) {
            if (DailyStockLimit::isExhausted($target['product'], $target['mapping'])) {
                throw new Exception(DailyStockLimit::EXHAUSTED_MESSAGE);
            }
        }

        // ── 4b. Promo (resolve only — validate + discount) ───────────────────
        // The quota lock + redemption happens later, inside the write
        // transaction; here we only price the order. Re-resolved rather than
        // trusting whatever the client was quoted.
        $discount = 0;

        if ($dto->promoCode) {
            $result = PromoResolver::resolve($dto->promoCode, $sellingPrice, $user, $product);

            if (! $result->valid) {
                throw new Exception($result->message);
            }

            // The discount comes out of margin, so a code worth more than
            // the margin would sell below cost. Refuse rather than quietly
            // honour less than the customer was promised — either outcome
            // is wrong, but only one of them loses money silently.
            if ($result->discount > $margin) {
                throw new Exception('Kode promo tidak dapat digunakan untuk produk ini.');
            }

            $discount = $result->discount;
            $sellingPrice -= $discount;
            $margin -= $discount;
        }

        // ── 4c. Points ───────────────────────────────────────────────────────
        // Applied after the promo and **before** the fee, so the fee follows the
        // rule the block below already states: the customer pays it on what they
        // are actually charged. It also means `payments.gross_amount` ends up as
        // the rupiah remainder, which is exactly what a refund has to give back.
        //
        // Points are NOT taken out of margin. A promo is the platform eating its
        // own margin; a point was already paid for in cash on an earlier order,
        // so that money is in the till. Charging it to margin here would make
        // the guard above reject a legitimate redemption on a thin product.
        $pointsSpent = 0;
        $pointsSpentAmount = 0;

        if ($dto->pointsToSpend > 0) {
            if (! $user) {
                throw new Exception('Poin hanya bisa digunakan oleh member. Silakan login terlebih dahulu.');
            }

            $plan = MembershipResolver::planFor($user);

            if ($plan && ! $plan->allows_point_spending) {
                throw new Exception('Paket membership kamu sudah termasuk potongan harga, jadi poin tidak bisa dipakai.');
            }

            if ($dto->pointsToSpend > (int) $user->point) {
                throw new Exception('Poin tidak mencukupi. Sisa poin: '.Money::digits((int) $user->point));
            }

            // Never let a customer overpay with points: cap at what the order
            // is actually worth, rounding down so redemption cannot overshoot.
            $pointsSpent = min($dto->pointsToSpend, PointRules::pointsToCover($sellingPrice));
            $pointsSpentAmount = PointRules::rupiahFor($pointsSpent);
            // NOTE: `amount_base` is written from `$sellingPrice` below, so it
            // lands NET of this deduction. GrantTransactionPointsAction earns on
            // `amount_base` as-is for that reason — subtracting the points there
            // too would deduct them twice.
            $sellingPrice -= $pointsSpentAmount;
        }

        // ── 5. Fee & total ───────────────────────────────────────────────────
        // Computed on the discounted price: the customer pays the fee on what
        // they are actually charged. The per-channel fee IS the "Biaya Admin"
        // the customer is shown — the markup lives in the channel's own
        // fee_flat/fee_percent, and there is no second global markup on top.
        // Kita's profit is this fee net of the gateway's real cut (see
        // SettleMerchantTransactionAction). Defaults to 0, so an unconfigured
        // channel charges exactly the product price.
        $feePercent = max(0, min(100, (float) $channel->fee_percent));
        $channelFee = $channel->fee_flat + (int) round($sellingPrice * ($feePercent / 100));
        $adminFee = $channelFee;
        $grossAmount = $sellingPrice + $adminFee;

        // The gateway's cut of the whole amount the customer pays, frozen now
        // rather than read from Monetapay's callback. Monetapay charges a flat
        // fee on VA/retail and a percent on QRIS/e-wallet — a channel carries
        // one or the other. Kita's profit is the admin fee net of this, so
        // settlement (SettleMerchantTransactionAction) reads it straight off the
        // payment row.
        $gatewayPercent = max(0, min(100, (float) $channel->gateway_fee_percent));
        $gatewayFee = (int) $channel->gateway_fee_flat + (int) round($grossAmount * ($gatewayPercent / 100));

        // Tax (PPN) is levied on the channel fee only and is kita's expense — it
        // reduces the platform profit at settlement, it is NOT added to what the
        // customer pays, so $grossAmount is deliberately left unchanged. Frozen
        // here so a later rate change never rewrites a booked transaction.
        $taxPercent = max(0, min(100, (float) $channel->tax_percent));
        $taxAmount = $channelFee > 0 ? (int) round($channelFee * ($taxPercent / 100)) : 0;

        // A fully points-covered order owes nothing, so a gateway minimum has
        // nothing to apply to. Without this exemption the guard rejects exactly
        // the redemption the feature exists to allow.
        if ($grossAmount > 0 && $grossAmount < $channel->min_amount) {
            throw new Exception(
                'Total tagihan '.Money::rupiah($grossAmount).
                ' kurang dari minimum pembayaran '.Money::rupiah((int) $channel->min_amount)
            );
        }

        // ── 6. Identifiers + frozen nickname ─────────────────────────────────
        $invoiceNumber = 'INV-'.date('Ymd').'-'.strtoupper(Str::random(6));
        $referenceId = 'PAY-'.$invoiceNumber.'-01';

        // Freeze the checked username. The client normally echoes it back, but
        // if it didn't, fall back to the name a recent "Cek Username" already
        // resolved (cache-only — never charges a new lookup) so the admin
        // record still carries it.
        $targetNickname = $dto->targetNickname
            ?: ($product->category
                ? $this->validateGameIdAction->cachedNickname($product->category, (string) $targetUid, $targetServer)
                : null);

        // ── 7. External gateway call ─────────────────────────────────────────
        // Kept out of the DB transaction so the HTTP round-trip never holds a
        // lock across the network; a gateway failure therefore persists nothing.
        // The one exception is a PROMO checkout: there the call is made *inside*
        // the transaction, after the promo row is locked and re-validated, so a
        // lost quota race can never mint a gateway order the local rows then roll
        // back — the losing racer fails the recheck before it ever calls the
        // gateway. Balance (wallet) never calls the gateway at all.
        $paymentInstructions = null;
        $pgTransactionId = null;

        $callGateway = function () use (
            $channel, $referenceId, $grossAmount, $sellingPrice, $user, $dto, $product,
            &$paymentInstructions, &$pgTransactionId,
        ): void {
            if ($channel->payment_type === 'payment_link') {
                $extra = $channel->extra_config ?? [];

                $plResponse = $this->monetapayService->createPaymentLink([
                    'mch_order_no' => $referenceId,
                    'amount' => (string) $grossAmount,
                    'currency' => 'IDR',
                    'regular_bank_codes' => $extra['regular_bank_codes'] ?? 'BNI',
                    'ewallet_bank_codes' => $extra['ewallet_bank_codes'] ?? 'DANA',
                    'qris_bank_code' => $extra['qris_bank_code'] ?? 'QRIS',
                    'terminal_type' => $extra['terminal_type'] ?? 'WAP',
                    'fixed_bank_code' => $extra['fixed_bank_code'] ?? '0',
                    'account_bank_code' => $extra['account_bank_code'] ?? '',
                    'sender_name' => $extra['sender_name'] ?? config('app.name'),
                    'account_name' => $user?->name ?? 'Guest',
                    'account_phone' => $user?->phone ?? $dto->guestContact ?? '',
                    'expire_seconds' => '36000',
                    'success_redirect_url' => config('services.monetapay.success_redirect_url'),
                    'failed_redirect_url' => config('services.monetapay.failed_redirect_url', ''),
                    'product_id' => (string) $product->id,
                    'product_name' => $product->name,
                    'product_category' => $product->category?->name ?? 'General',
                    'product_sub_category' => $product->subCategory?->name ?? '',
                    'product_description' => $product->name,
                    'product_price' => $sellingPrice,
                    'product_quantity' => 1,
                    'product_type' => 'PRODUCT',
                ]);

                if (($plResponse['code'] ?? -1) !== 0) {
                    throw new Exception('Payment Link creation failed: '.($plResponse['message'] ?? 'Unknown error'));
                }

                $plData = $plResponse['data'] ?? [];
                $paymentInstructions = array_filter([
                    'order_no' => $plData['order_no'] ?? null,
                    'checkout_url' => $plData['checkout_url'] ?? null,
                ]);
                $pgTransactionId = (string) ($plData['id'] ?? null);

                return;
            }

            $monetapayResponse = $this->monetapayService->createTransaction(
                referenceId: $referenceId,
                amount: $grossAmount,
                paymentType: $channel->payment_type,
                channelCode: $channel->channel_code,
                customerData: [
                    'customer_name' => $user?->name ?? 'Guest',
                    'customer_email' => $user?->email ?? 'guest@example.com',
                    'customer_phone' => $user?->phone ?? $dto->guestContact,
                    'is_single_use' => $channel->is_single_use ? '1' : '0',
                    'product_id' => (string) $product->id,
                    'product_name' => $product->name,
                    'product_price' => (string) $sellingPrice,
                    'product_category' => $product->category?->name ?? 'General',
                ]
            );

            $pgData = $monetapayResponse['data'] ?? [];
            $paymentInstructions = array_filter([
                'order_no' => $pgData['order_no'] ?? null,
                'qr_string' => $pgData['qr_string'] ?? null,
                'virtual_account' => $pgData['virtual_account'] ?? null,
                'bank_code' => $pgData['bank_code'] ?? null,
                'is_single_use' => $channel->payment_type === 'virtual_account'
                                        ? (bool) $channel->is_single_use
                                        : null,
            ], fn ($value) => $value !== null);
            $pgTransactionId = $pgData['order_no'] ?? null;
        };

        // A fully points-covered order owes nothing, so there is no gateway to
        // call — it settles like a wallet payment regardless of the channel the
        // customer picked. Their choice is still recorded on the transaction.
        $isExternal = $channel->channel_code !== 'balance' && $grossAmount > 0;
        // Defer the gateway call into the transaction only for a promo checkout,
        // so the quota lock is reserved before the order is minted.
        $gatewayInsideTx = $isExternal && (bool) $dto->promoCode;

        if ($isExternal && ! $gatewayInsideTx) {
            $callGateway();
        }

        // ── 8. Persist in one short transaction ──────────────────────────────
        $transactionStatus = TransactionStatus::PENDING;

        DB::transaction(function () use (
            $dto, $user, $product, $channel, $activeSupplier, $quotaTargets, $invoiceNumber, $referenceId,
            $targetNickname, $targetValues, $targetUid, $targetServer,
            $discount, $sellingPrice, $adminFee, $channelFee, $gatewayFee,
            $taxAmount, $taxPercent, $margin, $grossAmount, $callGateway, $gatewayInsideTx,
            $pointsSpent, $pointsSpentAmount, $isExternal,
            &$paymentInstructions, &$pgTransactionId, &$transactionStatus,
        ) {
            // The day's allowance, authoritatively: the mapping row is locked for
            // the count, so two checkouts racing for the last slot serialise here
            // and the loser sees the winner's transaction row — which was inserted
            // in this same transaction, before either of them commits.
            //
            // A mix locks EVERY component's mapping: each carries its own quota,
            // and the same serialisation argument applies to each of them.
            $lockedTargets = $quotaTargets->map(fn (array $target) => [
                'product' => $target['product'],
                'mapping' => SupplierProduct::whereKey($target['mapping']->id)->lockForUpdate()->first(),
            ]);

            foreach ($lockedTargets as $target) {
                if (DailyStockLimit::isExhausted($target['product'], $target['mapping'])) {
                    throw new Exception(DailyStockLimit::EXHAUSTED_MESSAGE);
                }
            }

            // Promo: lock the row so two concurrent redemptions cannot both slip
            // past a quota of one, and re-validate under the lock (a slot may
            // have been taken since the pricing resolve above). The pre-computed
            // discount/amounts are kept — this is a quota gate, not a re-price.
            $promo = null;
            if ($dto->promoCode) {
                $promo = Promo::whereRaw('UPPER(code) = ?', [strtoupper(trim($dto->promoCode))])
                    ->lockForUpdate()
                    ->first();

                $recheck = PromoResolver::resolve($dto->promoCode, $sellingPrice + $discount, $user, $product);
                if (! $recheck->valid) {
                    throw new Exception($recheck->message);
                }
            }

            // A promo checkout mints the gateway order here — under the promo
            // lock, after the quota recheck passed — so a losing racer (which
            // threw above) never creates an orphaned gateway order.
            if ($gatewayInsideTx) {
                $callGateway();
            }

            $transaction = Transaction::create([
                'transaction_type' => 'prepaid',
                'invoice_number' => $invoiceNumber,
                'user_id' => $user?->id,
                // The "client" that owns the sold product — settlement credits
                // them their net. Products carry no owner, so fall back to the
                // single default client merchant; that attribution is what makes
                // the sale appear in the payment-page feeds and settle at PAID.
                'merchant_id' => $product->merchant_id ?? DefaultMerchant::id(),
                'payment_channel_id' => $channel->id,
                'guest_contact' => $user ? null : $dto->guestContact,
                // Stored for everyone (guest + member): the receipt destination and
                // an order-tracking key. `locale` drives the receipt email language.
                'contact_email' => $dto->email,
                'locale' => $dto->locale ?? $user?->locale ?? 'id',
                'product_id' => $product->id,
                // A mix has no supplier of its own; the first component's stands
                // in, so the column is never null for a sold order and the
                // existing reports keep a supplier to group by.
                'supplier_id' => $activeSupplier?->supplier_id ?? $quotaTargets->first()['mapping']->supplier_id,
                'target_uid' => $targetUid,
                'target_server' => $targetServer,
                // The whole set, so a game with more identifiers than columns is
                // composed correctly at fulfilment.
                'target_values' => $targetValues !== [] ? $targetValues : null,
                'target_nickname' => $targetNickname,
                'promo_id' => $promo?->id,
                'amount_base' => $sellingPrice,
                'amount_fee' => $adminFee,
                'tax_amount' => $taxAmount,
                'tax_percent' => $taxPercent,
                'channel_fee' => $channelFee,
                // Always 0 now. The column is kept so historical rows — written
                // while a global markup existed — stay reconstructable.
                'admin_markup' => 0,
                'discount_amount' => $discount,
                // Its own line, deliberately: the rupiah was collected on an
                // earlier order, so this is a liability being discharged, not a
                // discount coming out of margin. Keeping it separate is what
                // lets finance report the cost of the points programme at all,
                // and what marks the order as having used points.
                'points_spent' => $pointsSpent,
                'points_spent_amount' => $pointsSpentAmount,
                'amount_total' => $grossAmount,
                'margin' => $margin,
                'status' => TransactionStatus::PENDING,
            ]);

            // Debit the points inside the same transaction as the order they
            // paid for. PointLedger locks the user row itself; on the balance
            // path that lock is taken again below, which nests as a savepoint.
            if ($pointsSpent > 0) {
                PointLedger::record(
                    user: $user->id,
                    amount: -$pointsSpent,
                    type: 'spend',
                    transactionId: $transaction->id,
                    reference: $invoiceNumber,
                    description: "Poin dipakai untuk {$invoiceNumber}",
                );
            }

            if ($promo) {
                PromoRedemption::create([
                    'promo_id' => $promo->id,
                    'user_id' => $user?->id,
                    'transaction_id' => $transaction->id,
                    'code_used' => $promo->code,
                    'discount_amount' => $discount,
                ]);

                // The redemption rows are the source of truth for quota; this
                // counter is the denormalised copy the admin list reads.
                $promo->increment('used_count');
            }

            $payment = Payment::create([
                'transaction_id' => $transaction->id,
                'payment_channel_id' => $channel->id,
                'reference_id' => $referenceId,
                'gross_amount' => $grossAmount,
                'admin_fee' => $adminFee,
                'channel_fee' => $channelFee,
                'admin_markup' => 0,
                'gateway_fee' => $gatewayFee,
                'tax_amount' => $taxAmount,
                'tax_percent' => $taxPercent,
                // Instructions/reference already obtained from the gateway above
                // (null for the balance path). Persisted so the invoice page can
                // re-render the QR/VA/link after a refresh.
                'pg_transaction_id' => $pgTransactionId,
                'payment_data' => $paymentInstructions ?: null,
                'status' => PaymentStatus::PENDING,
            ]);

            if (! $isExternal) {
                // ── Balance path ─────────────────────────────────────────────
                // Pessimistic lock: re-fetch the user row FOR UPDATE inside the
                // open transaction so concurrent balance checkouts serialize.
                // Without this, two requests could both read the same balance,
                // both pass the guard, and both decrement (TOCTOU double-spend).
                $lockedUser = User::whereKey($user->id)->lockForUpdate()->firstOrFail();

                if ($lockedUser->balance < $grossAmount) {
                    throw new Exception('Saldo tidak mencukupi. Sisa saldo: '.Money::rupiah((int) $lockedUser->balance));
                }

                // Through the ledger, not a raw decrement: the refund credit is
                // recorded as a `refund` mutation, and a statement showing money
                // coming back with nothing having gone out is worse than no
                // statement at all. WalletLedger re-locks the same row (already
                // held here) and writes the before/after figures.
                // Guarded: WalletLedger refuses a zero mutation, and an order
                // paid entirely with points owes exactly zero rupiah. Without
                // this the redemption crashes at the moment it succeeds.
                if ($grossAmount > 0) {
                    WalletLedger::record(
                        user: $lockedUser->id,
                        amount: -$grossAmount,
                        type: 'purchase',
                        reference: $transaction->invoice_number,
                        description: "Pembelian {$transaction->invoice_number}",
                    );
                }

                $payment->update(['status' => PaymentStatus::SUCCESS, 'paid_at' => now()]);

                // Balance channel has no external gateway cost, so kita keeps
                // the full admin fee (gateway_fee stays 0). Credit the merchant
                // and record kita's markup — no-op if platform-owned.
                $this->settleAction->execute($transaction);

                // uxiolabs fulfilment stays inside the transaction so an
                // infrastructure *exception* rolls the wallet charge back with
                // it; the lock held is the buyer's own row (per-user contention),
                // not the shared promo row. (A FAILED_PROVIDER *result* — uxiolabs
                // "cancel"/"refund" — is a normal return, not an exception, so it
                // commits; refunding that case is unchanged by this refactor.)
                $transaction = $this->uxiolabsAction->execute($transaction);
                $transactionStatus = $transaction->status; // COMPLETED / PROCESSING / FAILED_PROVIDER

                // Fulfilled synchronously from balance — email the receipt now.
                // Queued mail participates in this DB transaction, so it is only
                // delivered if the checkout commits.
                if ($transactionStatus === TransactionStatus::COMPLETED) {
                    $this->sendReceiptAction->execute($transaction);
                    // Points land only when the order is genuinely done —
                    // payment settled and the supplier delivered. Called here
                    // rather than from an observer for the same reason the
                    // receipt is: saveQuietly() bypasses observers, and this
                    // grants something worth money.
                    app(GrantTransactionPointsAction::class)->execute($transaction);
                }
            }

            // ── Activity log ─────────────────────────────────────────────────
            $this->logAction->execute(new CreateActivityLogDTO(
                userId: $user?->id,
                ipAddress: request()->ip(),
                userAgent: request()->userAgent(),
                message: "Checkout {$invoiceNumber} — {$product->name}".(! $user ? ' (Guest)' : ''),
            ));
        });

        // ── 9. Response ──────────────────────────────────────────────────────
        return [
            'invoice_number' => $invoiceNumber,
            'reference_id' => $referenceId,
            'product' => [
                'name' => $product->name,
                'price' => $sellingPrice,
            ],
            'payment' => [
                'channel' => $channel->name,
                'type' => $channel->payment_type,
                'amount' => $grossAmount,
                'admin_fee' => $adminFee, // "Biaya Admin" = the channel's fee
                'status' => $transactionStatus,
                'instructions' => $paymentInstructions ?: null,
            ],
        ];
    }
}
