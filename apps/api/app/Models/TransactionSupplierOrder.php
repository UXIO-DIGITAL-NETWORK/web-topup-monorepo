<?php

namespace App\Models;

use App\Enums\ProviderStatus;
use Illuminate\Database\Eloquent\Model;

/**
 * One supplier order placed for a transaction.
 *
 * A single-product transaction has exactly one of these; a mix product has one
 * per component. It exists because the supplier keys everything on `idtrx` and
 * rejects a duplicate — so each sub-order gets its own, and this is the row the
 * callback and the poller resolve against.
 *
 * `provider_status` is cast to the same enum as `transactions.provider_status`
 * so the two columns cannot drift into different vocabularies.
 */
class TransactionSupplierOrder extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'provider_status' => ProviderStatus::class,
        'attempts' => 'integer',
        'sequence' => 'integer',
    ];

    public function transaction()
    {
        return $this->belongsTo(Transaction::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }

    public function supplierProduct()
    {
        return $this->belongsTo(SupplierProduct::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    /** The state a human reads: delivered, rejected, or still in flight. */
    public function isTerminal(): bool
    {
        return in_array($this->provider_status, [ProviderStatus::DELIVERED, ProviderStatus::REJECTED, ProviderStatus::UNDELIVERED], true);
    }

    public function hasSucceeded(): bool
    {
        return $this->provider_status === ProviderStatus::DELIVERED;
    }

    public function hasFailed(): bool
    {
        return in_array($this->provider_status, [ProviderStatus::REJECTED, ProviderStatus::UNDELIVERED], true);
    }
}
