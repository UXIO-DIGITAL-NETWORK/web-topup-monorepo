<?php

namespace App\Jobs;

use App\Actions\Invoice\RecordInvoiceDeliveryLogAction;
use App\Models\InvoiceDeliveryLog;
use App\Models\Transaction;
use App\Services\PiWapiService;
use App\Support\Phone;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Delivers the purchase receipt (bukti pembayaran) over WhatsApp via PiWAPI: a
 * document message with the invoice PDF attached. Dispatched by
 * SendTransactionReceiptAction when an order is COMPLETED, alongside the email.
 *
 * No-op — not a failure — when PiWAPI is unconfigured, WhatsApp delivery is
 * switched off (`PIWAPI_ENABLED=false`, the default), or the buyer has no usable
 * number; those are expected states, not errors to retry. Each of them is still
 * recorded in the delivery log as `skipped`, so "no receipt went out" always has
 * a reason attached rather than being silence. Queued with retries so a
 * transient gateway blip doesn't drop the receipt on the first HTTP hiccup.
 */
class SendTransactionWhatsAppJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /** @var array<int, int> */
    public array $backoff = [60, 300, 900];

    public function __construct(
        public Transaction $transaction,
        public string $locale,
        public bool $isResend = false,
    ) {}

    public function handle(PiWapiService $piwapi): void
    {
        $recipient = Phone::toE164($this->transaction->user?->phone ?? $this->transaction->guest_contact);

        if (! $piwapi->canSend()) {
            $this->record(InvoiceDeliveryLog::STATUS_SKIPPED, $recipient, 'Pengiriman WhatsApp sedang dimatikan');

            return;
        }

        if ($recipient === null) {
            $this->record(InvoiceDeliveryLog::STATUS_SKIPPED, null, 'Pembeli tidak punya nomor WhatsApp');

            return;
        }

        $invoice = (string) $this->transaction->invoice_number;

        // Publicly reachable so PiWAPI can fetch the PDF itself — the invoice
        // download endpoint is intentionally public (polled receipt).
        $documentUrl = url("/api/v1/invoices/{$invoice}/download");
        $documentName = "Invoice-{$invoice}.pdf";

        $piwapi->sendDocument($recipient, $documentUrl, $documentName, $this->caption());

        // Reached only when the gateway accepted the message, so this is the one
        // place that can honestly say "sent".
        $this->record(InvoiceDeliveryLog::STATUS_SENT, $recipient);
    }

    private function caption(): string
    {
        $t = $this->transaction->loadMissing(['product.category', 'paymentChannel']);

        $target = trim(($t->target_uid ?? '').($t->target_server ? ' ('.$t->target_server.')' : ''));
        $game = $t->product?->category?->name;
        $product = trim(($game ? $game.' — ' : '').($t->product?->name ?? ''));

        $replace = [
            'brand' => (string) config('services.storefront.brand', 'TOPUP GAME'),
            'invoice' => (string) $t->invoice_number,
            'product' => $product !== '' ? $product : (string) $t->invoice_number,
            'target' => $target,
            'total' => 'Rp '.number_format((int) $t->amount_total, 0, ',', '.'),
        ];

        $key = $target !== '' ? 'whatsapp.receipt_caption' : 'whatsapp.receipt_caption_no_target';

        return (string) trans($key, $replace, $this->locale);
    }

    public function failed(Throwable $e): void
    {
        Log::channel('piwapi')->error("SendTransactionWhatsAppJob: retries exhausted for {$this->transaction->invoice_number}: {$e->getMessage()}");

        // No Discord call here: the log action raises the alarm itself from the
        // `failed` row, and doing both put the same failure in the channel twice.
        $this->record(
            InvoiceDeliveryLog::STATUS_FAILED,
            Phone::toE164($this->transaction->user?->phone ?? $this->transaction->guest_contact),
            $e->getMessage(),
        );
    }

    private function record(string $status, ?string $recipient, ?string $reason = null): void
    {
        app(RecordInvoiceDeliveryLogAction::class)->execute(
            $this->transaction,
            InvoiceDeliveryLog::CHANNEL_WHATSAPP,
            $status,
            $recipient,
            $reason,
            $this->isResend,
        );
    }
}
