<?php

declare(strict_types=1);

namespace App\Actions\Invoice;

use App\Models\InvoiceDeliveryLog;
use App\Models\Transaction;
use App\Services\DiscordWebhookService;

/**
 * Records one invoice-delivery attempt, and decides whether it is worth telling
 * Discord about.
 *
 * The row is always written — that is the point of the table. Discord is the
 * noisier half, so it is governed by `services.discord.invoice_log`:
 *
 *  - `all`      every delivered and every failed attempt (the default);
 *  - `failures` only the ones that went wrong;
 *  - `off`      nothing.
 *
 * `skipped` never reaches Discord under any policy. It is routine — every guest
 * order without a phone number, every order while WhatsApp delivery is switched
 * off — and routine events wearing the alarm badge is exactly the failure mode
 * `DiscordWebhookService` was written to stop.
 */
class RecordInvoiceDeliveryLogAction
{
    public function __construct(private DiscordWebhookService $discord) {}

    public function execute(
        Transaction $transaction,
        string $channel,
        string $status,
        ?string $recipient = null,
        ?string $reason = null,
        bool $isResend = false,
    ): InvoiceDeliveryLog {
        $log = InvoiceDeliveryLog::create([
            'transaction_id' => $transaction->id,
            'channel' => $channel,
            'recipient' => $recipient,
            'status' => $status,
            'reason' => $reason,
            'is_resend' => $isResend,
            'attempted_at' => now(),
        ]);

        $this->report($transaction, $log);

        return $log;
    }

    private function report(Transaction $transaction, InvoiceDeliveryLog $log): void
    {
        $policy = (string) config('services.discord.invoice_log', 'all');

        if ($policy === 'off') {
            return;
        }

        if ($log->status === InvoiceDeliveryLog::STATUS_SKIPPED) {
            return;
        }

        if ($policy === 'failures' && $log->status !== InvoiceDeliveryLog::STATUS_FAILED) {
            return;
        }

        $invoice = $transaction->invoice_number;
        $label = $log->channel === InvoiceDeliveryLog::CHANNEL_WHATSAPP ? 'WhatsApp' : 'Email';
        $resend = $log->is_resend ? ' (kirim ulang)' : '';

        if ($log->status === InvoiceDeliveryLog::STATUS_FAILED) {
            $this->discord->sendAlert(
                "Invoice {$invoice} GAGAL terkirim via {$label} ke {$log->recipient}{$resend}: "
                .($log->reason ?? 'alasan tidak diketahui')
            );

            return;
        }

        $this->discord->sendNotice("Invoice {$invoice} terkirim via {$label} ke {$log->recipient}{$resend}");
    }
}
