<?php

namespace App\Mail;

use App\Actions\Invoice\GenerateInvoicePdfAction;
use App\Models\Transaction;
use App\Support\DateTime\Wib;
use App\Support\PublicUrl;
use App\Support\Storefront\MediaUrl;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The purchase receipt emailed to the buyer once an order is COMPLETED. Sent
 * with `Mail::to()->locale($locale)`, so the subject and every `__('receipt.*')`
 * in the view resolve to the buyer's language (id | en).
 *
 * Deliberately NOT `ShouldQueue`: the send is owned by
 * `SendTransactionReceiptMailJob`, which needs `Mail::send` to reach the
 * transport before it returns. A queued mailable made that job report success
 * the moment it handed the work on — which is the confusion the
 * `invoice_delivery_logs` trail exists to remove.
 */
class TransactionReceiptMail extends Mailable
{
    use SerializesModels;

    public function __construct(public Transaction $transaction, public string $emailLocale) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: __('receipt.subject', ['invoice' => $this->transaction->invoice_number]),
        );
    }

    public function content(): Content
    {
        $t = $this->transaction->loadMissing(['product.category', 'paymentChannel']);

        // Null when the storefront base is not an address the customer could
        // open — the template then drops the CTA rather than offering a button
        // that goes nowhere. The receipt is still worth sending without it; the
        // refund claim link is not, which is why that one stops the send.
        $storeUrl = PublicUrl::storefront();
        $trackUrl = $storeUrl === null
            ? null
            : $storeUrl.'/'.$this->emailLocale.'/cek-pesanan?query='.urlencode($t->invoice_number);

        $target = trim(($t->target_uid ?? '').($t->target_server ? ' ('.$t->target_server.')' : ''));

        return new Content(
            view: 'emails.transaction-receipt',
            with: [
                'brand' => (string) config('services.storefront.brand', 'TOPUP GAME'),
                'invoice' => $t->invoice_number,
                'date' => Wib::format($t->created_at),
                'gameName' => $t->product?->category?->name,
                'gameLogo' => MediaUrl::for($t->product?->category?->logo),
                'productName' => $t->product?->name,
                'target' => $target !== '' ? $target : null,
                'serial' => $t->sn,
                'paymentName' => $t->paymentChannel?->name,
                'subtotal' => (int) $t->amount_base,
                'fee' => (int) $t->amount_fee,
                'discount' => (int) $t->discount_amount,
                'total' => (int) $t->amount_total,
                'trackUrl' => $trackUrl,
            ],
        );
    }

    /**
     * Attach the invoice PDF — the same file the storefront's "Download Invoice"
     * serves — regenerated at send time so no bytes ride along in the job payload.
     *
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        return [
            Attachment::fromData(
                fn () => app(GenerateInvoicePdfAction::class)->execute($this->transaction, $this->emailLocale),
                "Invoice-{$this->transaction->invoice_number}.pdf",
            )->withMime('application/pdf'),
        ];
    }
}
