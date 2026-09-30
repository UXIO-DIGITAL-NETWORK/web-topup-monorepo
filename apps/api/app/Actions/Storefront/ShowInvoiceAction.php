<?php

declare(strict_types=1);

namespace App\Actions\Storefront;

use App\Enums\TransactionStatus;
use App\Models\Transaction;
use App\Support\Payment\PaymentExpiry;
use App\Support\Points\PointRules;
use App\Support\Storefront\MediaUrl;

/**
 * The public receipt behind /invoice/{invoice_number}, polled every 5s by the
 * storefront until the status is terminal.
 *
 * The projection is built field-by-field on purpose. This endpoint is
 * unauthenticated — anyone holding the invoice number can read it — so it must
 * never carry `guest_contact`, `margin`, supplier ids, or cost prices. Invoice
 * numbers include six random characters and are therefore not enumerable, but
 * that is a second line of defence, not the first.
 */
class ShowInvoiceAction
{
    /** Statuses after which the client can stop polling. */
    public const TERMINAL_STATUSES = [
        TransactionStatus::COMPLETED,
        TransactionStatus::FAILED_PROVIDER,
        TransactionStatus::REFUNDED,
        TransactionStatus::EXPIRED,
    ];

    public function execute(string $invoiceNumber): ?array
    {
        $transaction = Transaction::query()
            ->where('invoice_number', $invoiceNumber)
            ->with([
                // point_percent/point_flat are selected because pointsFor() reads
                // them. Eloquent strict mode is off here, so a column left out of
                // this list would read back as null and silently fall through to
                // the global rule — quoting a different figure than checkout did.
                'product:id,category_id,name,point_percent,point_flat',
                'product.category:id,name,slug,code,region,logo,thumbnail',
                'paymentChannel:id,name,channel_code,payment_type',
                'payment:id,transaction_id,payment_channel_id,reference_id,gross_amount,admin_fee,payment_data,status,paid_at,created_at',
                'payment.paymentChannel:id,payment_type',
                'refundRequest:id,transaction_id,status,method,amount,refunded_at',
                // A mix is delivered piece by piece; the customer has to be able
                // to see which part is where. Only the name is selected — no
                // supplier id, no cost, same rules as the rest of this payload.
                'supplierOrders:id,transaction_id,product_id,provider_status,sn',
                'supplierOrders.product:id,name',
            ])
            ->first();

        if (! $transaction) {
            return null;
        }

        $payment = $transaction->payment;
        $refund = $transaction->refundRequest;
        $game = $transaction->product?->category;
        $expiresAt = $payment ? PaymentExpiry::for($payment) : null;

        return [
            'invoice_number' => $transaction->invoice_number,
            'status' => $transaction->status?->value,
            'is_terminal' => in_array($transaction->status, self::TERMINAL_STATUSES, true),

            'game' => $game ? [
                'name' => $game->name,
                'slug' => $game->slug ?: $game->code,
                'region' => $game->region,
                'logo_url' => MediaUrl::for($game->logo),
                'thumbnail_url' => MediaUrl::for($game->thumbnail),
            ] : null,

            'product' => [
                'name' => $transaction->product?->name,
            ],

            // What each part of the order is doing. A mix arrives in pieces, and
            // showing the whole order as "menunggu" while one part is already
            // delivered is exactly the kind of half-truth this projection is
            // built field-by-field to avoid. Name + status + serial only.
            'components' => $transaction->supplierOrders
                ->map(fn ($order) => [
                    'name' => $order->product?->name,
                    'status' => $order->provider_status?->value,
                    'sn' => $order->sn,
                ])
                ->values(),

            'target' => [
                'uid' => $transaction->target_uid,
                'server' => $transaction->target_server,
                'nickname' => $transaction->target_nickname,
            ],

            'amount' => [
                // `base` is already net of any discount — the figure the
                // customer was actually charged for the product.
                'base' => (int) $transaction->amount_base,
                'fee' => (int) $transaction->amount_fee, // combined (back-compat)
                'admin_fee' => (int) $transaction->channel_fee, // "Biaya Admin" = the channel's fee
                'discount' => (int) $transaction->discount_amount,
                'total' => (int) $transaction->amount_total,
            ],

            'points' => $this->pointsFor($transaction),

            'payment' => [
                'channel' => $transaction->paymentChannel?->name,
                'channel_code' => $transaction->paymentChannel?->channel_code,
                'type' => $transaction->paymentChannel?->payment_type,
                'reference_id' => $payment?->reference_id,
                'status' => $payment?->status?->value,
                'paid_at' => $payment?->paid_at?->toIso8601String(),
                // Persisted at checkout so a refresh still renders the QR / VA.
                'instructions' => $payment?->payment_data ?: null,
            ],

            // Drives the countdown. Null when the channel has no configured
            // window — the client then hides the timer rather than inventing one.
            'expires_at' => $expiresAt?->toIso8601String(),

            // Present only once a refund exists. Deliberately narrow: no claim
            // token, no contact details, nothing about the merchant. The token
            // is emailed, never served — otherwise the invoice number alone
            // (which is all this endpoint asks for) would let anyone redirect
            // the customer's money. The client uses `method` to decide between
            // "already in your balance" and "claim your refund".
            'refund' => $refund ? [
                'status' => $refund->status?->value,
                'method' => $refund->method?->value,
                'amount' => (int) $refund->amount,
                'refunded_at' => $refund->refunded_at?->toIso8601String(),
            ] : null,

            // Voucher / serial number, present once uxiolabs has fulfilled.
            'sn' => $transaction->sn,
            'created_at' => $transaction->created_at?->toIso8601String(),
        ];
    }

    /**
     * Loyalty points for this order, from the customer's point of view.
     *
     * Three states, not two. While the order is still open the figure is a
     * projection; once COMPLETED it is the granted amount read straight off the
     * row; and an order that ended any other way earns nothing, so it must not
     * show a projection it will never honour.
     *
     * The projection goes through `PointRules::earnedFor` on `amount_base` —
     * the very same helper and the very same column `GrantTransactionPointsAction`
     * uses — so the two cannot drift apart.
     *
     * @return array{earned: int, is_estimate: bool, eligible: bool}
     */
    private function pointsFor(Transaction $transaction): array
    {
        // Points are credited to an account. A guest order earns none, and
        // saying otherwise would be a promise the grant refuses to keep.
        $eligible = $transaction->user_id !== null;

        if ($transaction->status === TransactionStatus::COMPLETED) {
            return [
                'earned' => (int) $transaction->points_earned,
                'is_estimate' => false,
                'eligible' => $eligible,
            ];
        }

        $isOpen = ! in_array($transaction->status, self::TERMINAL_STATUSES, true);

        // Only the open-and-eligible case costs anything: PointRules reads two
        // uncached `settings` rows, and this endpoint is polled every 5s.
        $earned = $isOpen && $eligible
            ? PointRules::earnedFor($transaction->product, (int) $transaction->amount_base)
            : 0;

        return [
            'earned' => $earned,
            'is_estimate' => $isOpen,
            'eligible' => $eligible,
        ];
    }
}
