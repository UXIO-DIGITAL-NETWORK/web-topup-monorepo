<?php

namespace App\Http\Resources\Api\InvoiceLog;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One delivery attempt, as the admin log reads it.
 *
 * The invoice number is lifted off the relation so the table can show something
 * an operator recognises without a second request.
 */
class InvoiceDeliveryLogResource extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'transaction_id' => $this->transaction_id,
            'invoice_number' => $this->whenLoaded('transaction', fn () => $this->transaction?->invoice_number),
            'channel' => $this->channel,
            'recipient' => $this->recipient,
            'status' => $this->status,
            'reason' => $this->reason,
            'is_resend' => (bool) $this->is_resend,
            'attempted_at' => $this->attempted_at?->toIso8601String(),
        ];
    }
}
