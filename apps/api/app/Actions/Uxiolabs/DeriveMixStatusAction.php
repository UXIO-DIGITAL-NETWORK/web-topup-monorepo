<?php

declare(strict_types=1);

namespace App\Actions\Uxiolabs;

use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Models\Transaction;

/**
 * Rolls a mix transaction's sub-orders up into the one status the rest of the
 * system understands.
 *
 * A mix is delivered by several supplier orders, but everything downstream —
 * receipts, points, refunds, the admin list, the Hub's finance — reads the
 * single `transactions.status`. This is where those two facts are reconciled,
 * and it is the ONLY place that decides a mix's outcome, so the callback, the
 * poller and the fulfilment action can never disagree about it.
 *
 * The rule is deliberately blunt: every part delivered means delivered, ANY part
 * failed means failed (and the whole order is refunded — a half-delivered mix is
 * not something the customer can use), anything else is still in flight.
 */
final class DeriveMixStatusAction
{
    public function execute(Transaction $transaction): Transaction
    {
        $orders = $transaction->supplierOrders()->get();

        if ($orders->isEmpty()) {
            return $transaction;
        }

        if ($orders->every(fn ($order) => $order->hasSucceeded())) {
            $status = TransactionStatus::COMPLETED;
        } elseif ($orders->contains(fn ($order) => $order->hasFailed())) {
            $status = TransactionStatus::FAILED_PROVIDER;
        } else {
            $status = TransactionStatus::PROCESSING;
        }

        // The legacy columns describe one order: the first that actually
        // reached the supplier, so the existing screens have something true to
        // print rather than a blank where an id should be.
        $primary = $orders->first(fn ($order) => $order->supplier_trx_id !== null) ?? $orders->first();

        $serialNumbers = $orders->pluck('sn')->filter()->unique()->implode(', ');

        $transaction->update([
            'supplier_trx_id' => $primary->supplier_trx_id,
            'sn' => $serialNumbers !== '' ? $serialNumbers : $transaction->sn,
            'supplier_status' => match ($status) {
                TransactionStatus::COMPLETED => 'success',
                TransactionStatus::FAILED_PROVIDER => 'failed',
                default => 'pending',
            },
            'status' => $status,
            'provider_status' => match ($status) {
                TransactionStatus::COMPLETED => ProviderStatus::DELIVERED,
                TransactionStatus::FAILED_PROVIDER => ProviderStatus::REJECTED,
                default => $primary->supplier_trx_id !== null
                    ? ProviderStatus::ORDERED
                    : ProviderStatus::UNCONFIRMED,
            },
        ]);

        return $transaction->fresh();
    }
}
