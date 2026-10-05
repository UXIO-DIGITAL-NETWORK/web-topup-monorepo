<?php

namespace App\Actions\Transaction;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Uxiolabs\CheckUxiolabsTransactionStatusAction;
use App\Actions\Uxiolabs\SendUxiolabsStatusNotificationAction;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Enums\TransactionStatus;
use App\Models\Transaction;
use App\Models\TransactionSupplierOrder;
use Illuminate\Support\Facades\Auth;
use InvalidArgumentException;

/**
 * "Rehit" for ONE sub-order of a mix — re-poll the supplier about that part
 * alone and derive the parent's verdict.
 *
 * The transaction-level resend re-asks every open part; this is for the common
 * case where one component of a mix has stalled and the operator is looking
 * straight at its row.
 */
class AdminResendSupplierOrderCallbackAction
{
    public function __construct(
        private readonly CheckUxiolabsTransactionStatusAction $checkStatusAction,
        private readonly CreateActivityLogAction $activityLogAction,
    ) {}

    public function execute(Transaction $transaction, TransactionSupplierOrder $order): Transaction
    {
        if ((int) $order->transaction_id !== (int) $transaction->getKey()) {
            throw new InvalidArgumentException('Sub-order ini bukan milik transaksi tersebut.');
        }

        if ($transaction->status !== TransactionStatus::PROCESSING) {
            throw new InvalidArgumentException('Hanya transaksi PROCESSING yang bisa dicek ulang ke supplier.');
        }

        $updated = $this->checkStatusAction->pollOrder($order, SendUxiolabsStatusNotificationAction::SOURCE_MANUAL);

        $this->activityLogAction->execute(new CreateActivityLogDTO(
            userId: Auth::id(),
            ipAddress: request()->ip(),
            userAgent: request()->userAgent(),
            message: "Admin resent callback for sub-order {$order->idtrx} of Transaction: {$transaction->invoice_number}",
            transactionId: $transaction->id,
        ));

        return $updated;
    }
}
