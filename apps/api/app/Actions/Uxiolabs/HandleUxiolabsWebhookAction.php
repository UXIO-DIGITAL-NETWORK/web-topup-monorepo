<?php

namespace App\Actions\Uxiolabs;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Points\GrantTransactionPointsAction;
use App\Actions\Refund\InitiateRefundAction;
use App\Actions\Transaction\SendTransactionReceiptAction;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Models\Transaction;
use App\Models\TransactionSupplierOrder;
use App\Traits\MapsUxiolabsStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class HandleUxiolabsWebhookAction
{
    use MapsUxiolabsStatus;

    public function __construct(
        private readonly CreateActivityLogAction $logAction,
        private readonly InitiateRefundAction $refundAction,
        private readonly SendUxiolabsStatusNotificationAction $announce,
        private readonly DeriveMixStatusAction $deriveStatus,
    ) {}

    /**
     * Process a uxiolabs status callback.
     *
     * Payload is flat: {id, idtrx, keterangan, status, url_cb} where `idtrx` is
     * our invoice_number, `id` is uxiolabs's own invoice and `keterangan` the
     * serial number.
     *
     * Infrastructure failures are allowed to propagate so the controller can
     * return a non-2xx response and uxiolabs will retry delivery. Non-retryable
     * cases (unknown idtrx, already-terminal transaction) return quietly.
     *
     * @param  array<string,mixed>  $payload
     */
    public function execute(array $payload): void
    {
        if (empty($payload['idtrx'])) {
            return;
        }

        // Side effects that hit the network are captured here and run AFTER the
        // transaction commits, so we never hold a row lock across an HTTP call.
        $notification = null;   // [Transaction, oldStatus, newStatus] for Discord
        $needsRefund = false;   // provider failed → refund after commit

        DB::transaction(function () use ($payload, &$notification, &$needsRefund) {
            // A MIX places several orders, each with its own idtrx. Resolving
            // that first is what lets one callback settle one component instead
            // of writing a single component's verdict over the whole order —
            // which is exactly what matching on the invoice alone would do.
            $subOrder = TransactionSupplierOrder::where('idtrx', $payload['idtrx'])
                ->lockForUpdate()
                ->first();

            if ($subOrder) {
                [$notification, $needsRefund] = $this->applySubOrder($subOrder, $payload);

                return;
            }

            $transaction = Transaction::with(['payment', 'paymentChannel', 'user'])
                ->where('invoice_number', $payload['idtrx'])
                ->lockForUpdate()
                ->first();

            if (! $transaction) {
                Log::channel('uxiolabs')->warning("Uxiolabs Webhook: Transaction not found for idtrx {$payload['idtrx']}");

                return;
            }

            // Idempotency guard: skip if already in a terminal state.
            //
            // REFUNDED belongs here for a reason that is easy to miss: uxiolabs
            // can redeliver `cancel` and then `success`. Without it, a late
            // success callback would flip an already-refunded order back to
            // COMPLETED — after the member's wallet was credited or a guest was
            // wired their money — and we would have paid for the order twice.
            if (in_array($transaction->status, [
                TransactionStatus::COMPLETED,
                TransactionStatus::FAILED_PROVIDER,
                TransactionStatus::REFUNDED,
            ], true)) {
                Log::channel('uxiolabs')->info("Uxiolabs Webhook: Skipped — {$transaction->invoice_number} already {$transaction->status->value}");

                return;
            }

            $oldStatus = $transaction->status;
            $newStatus = $this->mapUxiolabsStatus($payload['status'] ?? 'pending');

            $sn = (string) ($payload['keterangan'] ?? '');

            $transaction->update([
                // The order response may have been lost (duplicate-idtrx path),
                // so the callback is also where supplier_trx_id self-heals.
                'supplier_trx_id' => ($payload['id'] ?? null) ?: $transaction->supplier_trx_id,
                'sn' => $sn !== '' ? $sn : $transaction->sn,
                'supplier_status' => $payload['status'] ?? $transaction->supplier_status,
                'status' => $newStatus,
                // Still in flight: the callback proves the supplier has the order.
                // Whether we can poll it depends on holding an id for it.
                ...($newStatus === TransactionStatus::PROCESSING
                    ? ['provider_status' => (($payload['id'] ?? null) ?: $transaction->supplier_trx_id)
                        ? ProviderStatus::ORDERED
                        : ProviderStatus::UNCONFIRMED]
                    : []),
            ]);

            if ($newStatus === TransactionStatus::FAILED_PROVIDER) {
                // Refund is delegated to the shared, idempotent action after commit
                // (it re-locks the row and no-ops if already refunded).
                $needsRefund = true;
            }

            $this->logAction->execute(new CreateActivityLogDTO(
                userId: $transaction->user_id,
                ipAddress: request()->ip() ?? '127.0.0.1',
                userAgent: 'Uxiolabs Webhook',
                message: "Uxiotopup updated {$transaction->invoice_number} to ".($payload['status'] ?? $newStatus->value).'. SN: '.($sn !== '' ? $sn : '-'),
                isSystem: true,
            ));

            $notification = [$transaction->fresh(), $oldStatus, $newStatus];
        });

        // ── Post-commit side effects (no DB lock held) ───────────────────────
        if ($needsRefund && $notification !== null) {
            // Single source of truth for wallet + gateway refund; idempotent.
            $this->refundAction->execute($notification[0]);
        }

        if ($notification !== null) {
            [$transaction, $oldStatus, $newStatus] = $notification;

            // Order fulfilled — email the receipt to the buyer (idempotent).
            if ($newStatus === TransactionStatus::COMPLETED) {
                app(SendTransactionReceiptAction::class)->execute($transaction);
                app(GrantTransactionPointsAction::class)->execute($transaction);
            }

            // Announced only when the status actually moved. uxiolabs
            // re-delivers `processing` while an order is in flight, and each one
            // used to post a `PROCESSING ➔ PROCESSING` embed — half the volume
            // in the operational channel, carrying nothing an operator could
            // act on.
            //
            // Deliberately gated here and not on `$notification` itself: that
            // variable also drives the refund and the receipt, both of which
            // must keep running on a redelivery.
            if ($oldStatus !== $newStatus) {
                $this->announce->statusChanged(
                    $transaction,
                    $oldStatus,
                    $newStatus,
                    SendUxiolabsStatusNotificationAction::SOURCE_CALLBACK,
                );
            }
        }
    }

    /**
     * Settle ONE component of a mix, then re-derive the parent order's status.
     *
     * Runs inside the caller's transaction and with the parent row locked, so a
     * callback cannot race the poller into two different verdicts.
     *
     * @param  array<string,mixed>  $payload
     * @return array{0: array{0: Transaction, 1: TransactionStatus, 2: TransactionStatus}|null, 1: bool}
     */
    private function applySubOrder(TransactionSupplierOrder $order, array $payload): array
    {
        $transaction = Transaction::with(['payment', 'paymentChannel', 'user'])
            ->whereKey($order->transaction_id)
            ->lockForUpdate()
            ->firstOrFail();

        // The parent already settled (or was refunded) — a late redelivery must
        // not reopen it. Same guard the single-order path uses, and the same
        // reason: uxiolabs can redeliver `cancel` and then `success`.
        if (in_array($transaction->status, [
            TransactionStatus::COMPLETED,
            TransactionStatus::FAILED_PROVIDER,
            TransactionStatus::REFUNDED,
        ], true)) {
            Log::channel('uxiolabs')->info("Uxiolabs Webhook: sub-order {$order->idtrx} skipped — {$transaction->invoice_number} already {$transaction->status->value}");

            return [null, false];
        }

        $oldStatus = $transaction->status;
        $componentStatus = $this->mapUxiolabsStatus($payload['status'] ?? 'pending');
        $sn = (string) ($payload['keterangan'] ?? '');
        $supplierId = ($payload['id'] ?? null) ?: $order->supplier_trx_id;

        $order->update([
            'supplier_trx_id' => $supplierId,
            'sn' => $sn !== '' ? $sn : $order->sn,
            'supplier_status' => $payload['status'] ?? $order->supplier_status,
            'provider_status' => match ($componentStatus) {
                TransactionStatus::COMPLETED => ProviderStatus::DELIVERED,
                TransactionStatus::FAILED_PROVIDER => ProviderStatus::REJECTED,
                default => $supplierId ? ProviderStatus::ORDERED : ProviderStatus::UNCONFIRMED,
            },
        ]);

        $fresh = $this->deriveStatus->execute($transaction);

        $this->logAction->execute(new CreateActivityLogDTO(
            userId: $fresh->user_id,
            ipAddress: request()->ip() ?? '127.0.0.1',
            userAgent: 'Uxiolabs Webhook',
            message: "Uxiotopup updated sub-order {$order->idtrx} of {$fresh->invoice_number} to ".($payload['status'] ?? $componentStatus->value).'. SN: '.($sn !== '' ? $sn : '-'),
            isSystem: true,
        ));

        return [[$fresh, $oldStatus, $fresh->status], $fresh->status === TransactionStatus::FAILED_PROVIDER];
    }
}
