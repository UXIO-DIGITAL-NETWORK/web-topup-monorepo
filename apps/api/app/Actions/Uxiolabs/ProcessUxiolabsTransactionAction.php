<?php

namespace App\Actions\Uxiolabs;

use App\Actions\Log\CreateActivityLogAction;
use App\Contracts\SupplierDuplicateOrderException;
use App\Contracts\SupplierGateway;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Jobs\PollUxiolabsStatusJob;
use App\Models\Transaction;
use App\Services\CustomerNumberFormatter;
use App\Support\Uxiolabs\StatusPollSchedule;
use App\Traits\MapsUxiolabsStatus;
use Exception;

class ProcessUxiolabsTransactionAction
{
    use MapsUxiolabsStatus;

    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly CreateActivityLogAction $logAction,
        private readonly CustomerNumberFormatter $customerNumberFormatter,
        private readonly SendUxiolabsStatusNotificationAction $announce,
    ) {}

    public function execute(Transaction $transaction): Transaction
    {
        // Resolve the active supplier mapping for this product
        $supplierProduct = $transaction->product
            ->supplierProducts()
            ->where('is_active', true)
            ->first();

        if (! $supplierProduct) {
            throw new Exception('Produk ini belum dipetakan ke supplier aktif.');
        }

        // A product mapped to the platform's own supplier (a hand-made product)
        // has nothing to send: an admin fulfils it through
        // POST /v1/transactions/{id}/manual-review. Returning here — instead of
        // calling the gateway — is what stops a manual product from being ordered
        // at Uxiotopup under a SKU that does not exist there.
        //
        // PAID + QUEUED is the honest state: paid, not yet handed to anyone. It
        // also downgrades the PROCESSING the job sets on the way in, which would
        // otherwise claim we are still trying to send.
        if ($supplierProduct->supplier?->is_system) {
            $transaction->update([
                'status' => TransactionStatus::PAID,
                'provider_status' => ProviderStatus::QUEUED,
            ]);

            $this->logAction->execute(new CreateActivityLogDTO(
                userId: null,
                ipAddress: '127.0.0.1',
                userAgent: 'System/ManualFulfilment',
                message: "Order {$transaction->invoice_number} menunggu pemenuhan manual (supplier Internal System).",
                isSystem: true,
            ));

            return $transaction;
        }

        // target shape is data-driven per category (categories.order_form_fields);
        // uxiolabs expects "dataId|zoneId" (pipe), or just dataId when no zone.
        $target = $this->customerNumberFormatter->forTransaction($transaction);

        // kontak is mandatory on /order. Members may not have a phone and guest
        // checkouts may omit contact, so fall back to a placeholder rather than
        // failing a paid order over an optional-for-us field.
        $transaction->loadMissing('user');
        $kontak = $transaction->user?->phone ?: $transaction->guest_contact ?: '0000000000';

        try {
            $response = $this->uxiolabsService->createOrder(
                $supplierProduct->buyer_sku_code, // holds the uxiolabs service_id
                $target,
                $kontak,
                $transaction->invoice_number // used as uxiolabs idtrx
            );
        } catch (SupplierDuplicateOrderException $e) {
            // A previous attempt (whose response we lost) already placed this
            // order. Settle to PROCESSING and let the callback finalise it —
            // rethrowing would re-order forever and failed() would refund a
            // customer whose topup is actually in flight.
            $transaction->update([
                'supplier_status' => $transaction->supplier_status ?? 'pending',
                'status' => TransactionStatus::PROCESSING,
                // uxiolabs holds the order but we never got its id back, and
                // /status has no lookup by our own reference — so this one is
                // genuinely unpollable, only the callback can finish it. The
                // PROCESSING default (SENDING) would claim we are still trying.
                'provider_status' => ProviderStatus::UNCONFIRMED,
            ]);

            $this->logAction->execute(new CreateActivityLogDTO(
                userId: null,
                ipAddress: '127.0.0.1',
                userAgent: 'System/UxiolabsWorker',
                message: "Uxiotopup duplicate idtrx for {$transaction->invoice_number} — order already placed, awaiting callback.",
                isSystem: true,
            ));

            // Announced like any other handoff: from the channel's point of view
            // the order is with the supplier. The missing `supplier_trx_id` is
            // the detail that matters here, and the embed says so in words —
            // this is the one shape that only the callback can finish.
            $this->announce->handoff($transaction);

            return $transaction;
        }

        $supplierTrxId = $response['id'] ?? null;
        $mapped = $this->mapUxiolabsStatus($response['status'] ?? 'pending');

        $transaction->update([
            // data.id is uxiolabs's own invoice — the only key /status accepts.
            'supplier_trx_id' => $supplierTrxId,
            'sn' => ($response['keterangan'] ?? '') !== '' ? $response['keterangan'] : null,
            'supplier_status' => $response['status'] ?? 'pending',
            'status' => $mapped,
            // Still in flight: distinguish "the supplier took it and we can poll"
            // from "we are mid-call". A terminal response falls through to the
            // policy default (DELIVERED / REJECTED).
            ...($mapped === TransactionStatus::PROCESSING
                ? ['provider_status' => $supplierTrxId ? ProviderStatus::ORDERED : ProviderStatus::UNCONFIRMED]
                : []),
        ]);

        $this->logAction->execute(new CreateActivityLogDTO(
            userId: null,
            ipAddress: '127.0.0.1',
            userAgent: 'System/UxiolabsWorker',
            message: "Uxiotopup order sent for {$transaction->invoice_number}. Status: {$transaction->supplier_status}",
            isSystem: true,
        ));

        // The handoff itself, and the only place `supplier_trx_id` reaches the
        // channel. A payment with no handoff behind it is an order that never
        // left — which is only visible if the handoff is normally there.
        $this->announce->handoff($transaction);

        // A supplier that answers terminally on the order call (instant SKUs do)
        // never produces a callback or a poll, so this is the only chance to
        // report the outcome.
        if ($mapped !== TransactionStatus::PROCESSING) {
            $this->announce->statusChanged(
                $transaction,
                TransactionStatus::PROCESSING,
                $mapped,
                SendUxiolabsStatusNotificationAction::SOURCE_ORDER,
            );
        }

        // The supplier callback is unreliable, so start the self-rescheduling poll
        // chain (5s → widening) that drives this order to its terminal state. Only
        // when it's actually in flight — an order that came back terminal, or the
        // duplicate-idtrx branch (no supplier_trx_id), has nothing to poll.
        if ($transaction->status === TransactionStatus::PROCESSING && $transaction->supplier_trx_id) {
            $transaction->forceFill(['supplier_status_checked_at' => now()])->saveQuietly();

            PollUxiolabsStatusJob::dispatch($transaction->id, now()->toIso8601String())
                ->delay(now()->addSeconds(StatusPollSchedule::intervalSeconds(0)));
        }

        return $transaction;
    }
}
