<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One attempt to deliver an order's invoice to the buyer over email or WhatsApp.
 *
 * Written where the outcome is actually known — inside the sending job — never
 * at the moment the send is queued. `skipped` is a real answer too: a guest
 * with no phone number, or WhatsApp switched off, is recorded rather than
 * silently absent.
 */
class InvoiceDeliveryLog extends Model
{
    public const CHANNEL_EMAIL = 'email';

    public const CHANNEL_WHATSAPP = 'whatsapp';

    public const STATUS_SENT = 'sent';

    public const STATUS_FAILED = 'failed';

    public const STATUS_SKIPPED = 'skipped';

    protected $guarded = ['id'];

    protected $casts = [
        'is_resend' => 'boolean',
        'attempted_at' => 'datetime',
    ];

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(Transaction::class);
    }
}
