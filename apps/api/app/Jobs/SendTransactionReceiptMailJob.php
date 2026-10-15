<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Actions\Invoice\RecordInvoiceDeliveryLogAction;
use App\Mail\TransactionReceiptMail;
use App\Models\InvoiceDeliveryLog;
use App\Models\Transaction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Delivers the purchase receipt by email, and records how it ended.
 *
 * The receipt used to be queued straight from the channel (`Mail::queue`), which
 * stamped `receipt_sent_at` at the moment of queueing — so a send that failed
 * afterwards was indistinguishable from one that arrived. Sending happens here
 * instead, inside a job that owns the retries, so `handle()` returning really
 * does mean the transport accepted the message. `TransactionReceiptMail` is no
 * longer `ShouldQueue` for the same reason: a queued mailable would make this
 * job report success the instant it handed the work on.
 */
class SendTransactionReceiptMailJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    /** @var array<int, int> */
    public array $backoff = [60, 300, 900];

    public function __construct(
        public Transaction $transaction,
        public string $locale,
        public string $recipient,
        public bool $isResend = false,
    ) {}

    public function handle(): void
    {
        Mail::to($this->recipient)
            ->locale($this->locale)
            ->send(new TransactionReceiptMail($this->transaction, $this->locale));

        $this->record(InvoiceDeliveryLog::STATUS_SENT);
    }

    public function failed(Throwable $e): void
    {
        Log::error("SendTransactionReceiptMailJob: retries exhausted for {$this->transaction->invoice_number}: {$e->getMessage()}");

        $this->record(InvoiceDeliveryLog::STATUS_FAILED, $e->getMessage());
    }

    private function record(string $status, ?string $reason = null): void
    {
        app(RecordInvoiceDeliveryLogAction::class)->execute(
            $this->transaction,
            InvoiceDeliveryLog::CHANNEL_EMAIL,
            $status,
            $this->recipient,
            $reason,
            $this->isResend,
        );
    }
}
