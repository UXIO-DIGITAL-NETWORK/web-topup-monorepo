<?php

declare(strict_types=1);

namespace App\Actions\Uxiolabs;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Refund\InitiateRefundAction;
use App\Contracts\SupplierDuplicateOrderException;
use App\Contracts\SupplierGateway;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Jobs\PollUxiolabsStatusJob;
use App\Models\Transaction;
use App\Models\TransactionSupplierOrder;
use App\Services\CustomerNumberFormatter;
use App\Support\Uxiolabs\StatusPollSchedule;
use Exception;
use Throwable;

/**
 * Fulfils a MIX product: one paid order, one supplier order per component,
 * plus the product's OWN provider SKU when it still carries one (a mix built
 * from a provider SKU is delivered by that SKU as well).
 *
 * The single-product path (`ProcessUxiolabsTransactionAction`) places exactly
 * one order and keys it on the invoice number. That cannot carry a mix: the
 * supplier rejects a duplicate `idtrx`, and a mix needs several. So every order
 * here gets its own reference — `{invoice}-{productId}-{sequence}` — which is
 * also what the callback resolves against.
 *
 * The reference is derived, not counted: a retry after a lost response rebuilds
 * the SAME idtrx for the same component and sequence, which is what makes the
 * retry idempotent at the supplier instead of a second order.
 *
 * A component mapped to the platform's own supplier is skipped — an admin
 * delivers that part by hand, exactly as for a manual product.
 */
class ProcessMixTransactionAction
{
    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly CustomerNumberFormatter $customerNumberFormatter,
        private readonly DeriveMixStatusAction $deriveStatus,
        private readonly SendUxiolabsStatusNotificationAction $announce,
        private readonly InitiateRefundAction $refundAction,
        private readonly CreateActivityLogAction $logAction,
    ) {}

    public function execute(Transaction $transaction): Transaction
    {
        $components = $transaction->product?->mixItems()->with('component')->get() ?? collect();

        if ($components->isEmpty()) {
            throw new Exception('Produk mix ini tidak punya komponen.');
        }

        // Same shape as the single-product path: the target is data-driven per
        // category, and a missing contact falls back to a placeholder rather
        // than failing a paid order over an optional-for-us field.
        $target = $this->customerNumberFormatter->forTransaction($transaction);

        $transaction->loadMissing('user');
        $kontak = $transaction->user?->phone ?: $transaction->guest_contact ?: '0000000000';

        $placed = 0;

        // The product's OWN provider SKU, when it still has one, is ordered too:
        // a from-provider mix is delivered by that SKU AND its components, which
        // is why its cost is part of the accumulated modal. A hand-made bundle
        // has no mapping and starts at the components below.
        $ownMapping = $transaction->product->supplierProducts()->where('is_active', true)->first();

        if ($ownMapping) {
            $order = $this->placeOne($transaction, (int) $transaction->product->getKey(), $ownMapping, 1, $target, $kontak);
            $placed += $order->supplier_trx_id !== null ? 1 : 0;
        }

        foreach ($components as $item) {
            $component = $item->component;

            if ($component === null) {
                throw new Exception('Ada komponen mix yang sudah tidak ada.');
            }

            $mapping = $component->supplierProducts()->where('is_active', true)->first();

            if (! $mapping) {
                throw new Exception("Komponen {$component->code} belum dipetakan ke supplier aktif.");
            }

            // Quantity is a local concept — the supplier only knows SKUs — so a
            // component asked for three times becomes three supplier orders.
            for ($sequence = 1; $sequence <= max(1, (int) $item->quantity); $sequence++) {
                $order = $this->placeOne($transaction, $component->id, $mapping, $sequence, $target, $kontak);
                $placed += $order->supplier_trx_id !== null ? 1 : 0;
            }
        }

        $before = $transaction->status;
        $fresh = $this->deriveStatus->execute($transaction);

        $this->logAction->execute(new CreateActivityLogDTO(
            userId: null,
            ipAddress: '127.0.0.1',
            userAgent: 'System/UxiolabsWorker',
            message: "Uxiotopup mix {$transaction->invoice_number}: {$placed} sub-order placed, status {$fresh->status->value}.",
            isSystem: true,
        ));

        $this->announce->handoff($fresh);

        if ($fresh->status !== $before) {
            $this->announce->statusChanged(
                $fresh,
                $before,
                $fresh->status,
                SendUxiolabsStatusNotificationAction::SOURCE_ORDER,
            );
        }

        // A component the supplier answered terminally on would otherwise never
        // be refunded: there is no callback coming for a rejected order, and the
        // queue's retry path only covers thrown failures. Idempotent.
        if ($fresh->status === TransactionStatus::FAILED_PROVIDER) {
            $this->refundAction->execute($fresh);
        }

        // Still in flight with something to poll — the supplier callback is
        // unreliable, so the status chain gets started here as well.
        if ($fresh->status === TransactionStatus::PROCESSING
            && $fresh->supplierOrders()->whereNotNull('supplier_trx_id')->exists()) {
            $fresh->forceFill(['supplier_status_checked_at' => now()])->saveQuietly();

            PollUxiolabsStatusJob::dispatch($fresh->id, now()->toIso8601String())
                ->delay(now()->addSeconds(StatusPollSchedule::intervalSeconds(0)));
        }

        return $fresh;
    }

    /**
     * @param  array<string,mixed>  $mapping  the product's active supplier mapping
     */
    private function placeOne(
        Transaction $transaction,
        int $productId,
        $mapping,
        int $sequence,
        string $target,
        string $kontak,
    ): TransactionSupplierOrder {
        $idtrx = "{$transaction->invoice_number}-{$productId}-{$sequence}";

        // First-or-create BEFORE the call, so the reference exists even if the
        // response is lost and a retry rebuilds the same one.
        $order = TransactionSupplierOrder::firstOrNew([
            'transaction_id' => $transaction->getKey(),
            'product_id' => $productId,
            'sequence' => $sequence,
        ]);

        $order->fill([
            'supplier_product_id' => $mapping->getKey(),
            'supplier_id' => $mapping->supplier_id,
            'buyer_sku_code' => $mapping->buyer_sku_code,
            'idtrx' => $order->idtrx ?: $idtrx,
            'attempts' => ((int) $order->attempts) + 1,
        ])->save();

        // Already with the supplier — a retry must not order it twice.
        if ($order->supplier_trx_id !== null) {
            return $order;
        }

        // The platform's own supplier is fulfilled by a human, not by an HTTP
        // call. Left NOT_ORDERED on purpose: that is the honest state.
        if ($mapping->supplier?->is_system) {
            return $order;
        }

        try {
            $response = $this->uxiolabsService->createOrder(
                $mapping->buyer_sku_code,
                $target,
                $kontak,
                $order->idtrx,
            );
        } catch (SupplierDuplicateOrderException $e) {
            $order->update([
                'provider_status' => ProviderStatus::UNCONFIRMED,
                'last_error' => 'Supplier menolak: idtrx sudah ada — menunggu callback.',
            ]);

            return $order;
        } catch (Throwable $e) {
            // Recorded before rethrowing: the queue retries, and the row's
            // idtrx keeps that retry idempotent.
            $order->update(['last_error' => $e->getMessage()]);

            throw $e;
        }

        $supplierTrxId = $response['id'] ?? null;

        $order->update([
            'supplier_trx_id' => $supplierTrxId,
            'supplier_status' => $response['status'] ?? 'pending',
            'sn' => ($response['keterangan'] ?? '') !== '' ? $response['keterangan'] : null,
            'provider_status' => $this->providerStatusFor($response['status'] ?? 'pending', $supplierTrxId !== null),
            'last_error' => null,
        ]);

        return $order;
    }

    private function providerStatusFor(string $supplierStatus, bool $hasSupplierId): ProviderStatus
    {
        return match ($this->mapStatus($supplierStatus)) {
            TransactionStatus::COMPLETED => ProviderStatus::DELIVERED,
            TransactionStatus::FAILED_PROVIDER => ProviderStatus::REJECTED,
            default => $hasSupplierId ? ProviderStatus::ORDERED : ProviderStatus::UNCONFIRMED,
        };
    }

    private function mapStatus(string $supplierStatus): TransactionStatus
    {
        return match (strtolower($supplierStatus)) {
            'success' => TransactionStatus::COMPLETED,
            'cancel', 'refund', 'failed', 'gagal' => TransactionStatus::FAILED_PROVIDER,
            default => TransactionStatus::PROCESSING,
        };
    }
}
