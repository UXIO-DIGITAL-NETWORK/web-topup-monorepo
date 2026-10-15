<?php

declare(strict_types=1);

namespace App\Notifications\Channels;

use App\Actions\Invoice\RecordInvoiceDeliveryLogAction;
use App\Contracts\ReceiptChannel;
use App\Jobs\SendTransactionWhatsAppJob;
use App\Models\InvoiceDeliveryLog;
use App\Models\Transaction;
use App\Support\Phone;

/**
 * The same receipt as a PDF document, over WhatsApp (PiWAPI).
 *
 * Delivery ships OFF as part of the future subscription, so the job this queues
 * is a no-op until it is switched on (`PiWapiService::canSend()`). The guard is
 * still stamped when a job is queued — mirroring the email channel — so turning
 * WhatsApp on does not suddenly re-send every historical order.
 */
class WhatsAppReceiptChannel implements ReceiptChannel
{
    public function send(Transaction $transaction, string $locale, bool $force = false): bool
    {
        if (! $force && $transaction->whatsapp_sent_at !== null) {
            return false;
        }

        // Member phone first, else the WhatsApp number captured at guest checkout.
        $recipient = Phone::toE164($transaction->user?->phone ?? $transaction->guest_contact);

        if ($recipient === null) {
            app(RecordInvoiceDeliveryLogAction::class)->execute(
                $transaction,
                InvoiceDeliveryLog::CHANNEL_WHATSAPP,
                InvoiceDeliveryLog::STATUS_SKIPPED,
                null,
                'Pembeli tidak punya nomor WhatsApp',
                $force,
            );

            return false;
        }

        SendTransactionWhatsAppJob::dispatch($transaction, $locale, $force);

        // Optimistic — mirrors the email guard, which marks sent after queueing.
        $transaction->forceFill(['whatsapp_sent_at' => now()])->save();

        return true;
    }
}
