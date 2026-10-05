<?php

namespace App\Models;

use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Observers\TransactionObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[ObservedBy(TransactionObserver::class)]
class Transaction extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $casts = [
        'points_spent' => 'integer',
        'points_spent_amount' => 'integer',
        'points_earned' => 'integer',
        'status' => TransactionStatus::class,
        // Every identifier the game asked for, keyed by its own field keys.
        // target_uid/target_server mirror the first two so the invoice, receipt,
        // WhatsApp and member list keep working; this column is what a category
        // declaring more than two identifiers needs.
        'target_values' => 'array',
        // The supplier's half of the lifecycle, kept in lockstep with `status`
        // by TransactionObserver. Not to be confused with `supplier_status`,
        // which is uxiolabs's own raw wording, kept as evidence.
        'provider_status' => ProviderStatus::class,
        'receipt_sent_at' => 'datetime',
        'whatsapp_sent_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /** The "client" (merchant) that owns the sold product; null for platform-owned sales. */
    public function merchant()
    {
        return $this->belongsTo(User::class, 'merchant_id');
    }

    /**
     * withTrashed on purpose: an archived product must keep resolving here or
     * the history it was archived to protect breaks instead.
     *
     * Without it, `ProductResource` (which dereferences `$this->id` on a null
     * resource) 500s the admin transaction list and the dashboard,
     * `GetDashboardPerformanceAction`'s inner join silently drops the row and
     * its revenue, and `ProcessUxiolabsTransactionAction` — which reaches
     * `$transaction->product->` with no null-safe operator — cannot fulfil an
     * order that was already paid for.
     */
    public function product()
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    /**
     * The supplier orders placed for this transaction — one per component of a
     * mix product, and exactly one for everything else.
     *
     * The columns on this table (`supplier_trx_id`, `sn`, `provider_status`)
     * describe the FIRST of these, kept for the screens and reports that predate
     * mixes. Anything that needs the whole truth reads this relation.
     */
    public function supplierOrders()
    {
        return $this->hasMany(TransactionSupplierOrder::class);
    }

    public function payment()
    {
        return $this->hasOne(Payment::class);
    }

    /** At most one — `refund_requests.transaction_id` is unique. */
    public function refundRequest()
    {
        return $this->hasOne(RefundRequest::class);
    }

    public function pointHistories()
    {
        return $this->hasMany(PointHistory::class);
    }

    public function rating()
    {
        return $this->hasOne(Rating::class);
    }

    public function paymentChannel()
    {
        return $this->belongsTo(PaymentChannel::class);
    }
}
