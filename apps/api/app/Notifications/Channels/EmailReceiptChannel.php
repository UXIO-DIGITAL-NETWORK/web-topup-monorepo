<?php

declare(strict_types=1);

namespace App\Notifications\Channels;

use App\Actions\Invoice\RecordInvoiceDeliveryLogAction;
use App\Contracts\ReceiptChannel;
use App\Jobs\SendTransactionReceiptMailJob;
use App\Models\InvoiceDeliveryLog;
use App\Models\Transaction;

/**
 * The receipt itself, by email.
 *
 * The only channel that currently carries a usable order record to the buyer,
 * so its guard (`receipt_sent_at`) is the one that matters most: a duplicate
 * receipt email is worse than a missed one, because the customer already has it.
 *
 * The send is handed to `SendTransactionReceiptMailJob` rather than queued from
 * here, so the delivery log records what happened instead of what was attempted.
 */
class EmailReceiptChannel implements ReceiptChannel
{
    public function send(Transaction $transaction, string $locale, bool $force = false): bool
    {
        if (! $force && $transaction->receipt_sent_at !== null) {
            return false;
        }

        // The buyer's account email if a member, else the email captured at checkout.
        $email = $transaction->user?->email ?? $transaction->contact_email;

        if (! $email) {
            app(RecordInvoiceDeliveryLogAction::class)->execute(
                $transaction,
                InvoiceDeliveryLog::CHANNEL_EMAIL,
                InvoiceDeliveryLog::STATUS_SKIPPED,
                null,
                'Pembeli tidak punya alamat email',
                $force,
            );

            return false;
        }

        SendTransactionReceiptMailJob::dispatch($transaction, $locale, $email, $force);

        $transaction->forceFill(['receipt_sent_at' => now()])->save();

        return true;
    }
}
