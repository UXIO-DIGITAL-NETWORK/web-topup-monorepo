<?php

namespace App\Models;

use App\Enums\PriceChangeLogSource;
use App\Enums\PriceChangeLogStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PriceChangeLog extends Model
{
    use HasFactory;

    protected $guarded = ['id'];

    protected $casts = [
        'status' => PriceChangeLogStatus::class,
        'source' => PriceChangeLogSource::class,
        'old_cost' => 'integer',
        'new_cost' => 'integer',
        'old_price_member' => 'integer',
        'new_price_member' => 'integer',
        'old_price_vip' => 'integer',
        'new_price_vip' => 'integer',
        'old_price_reseller' => 'integer',
        'new_price_reseller' => 'integer',
        'old_price_agent' => 'integer',
        'new_price_agent' => 'integer',
    ];

    public function supplierProduct(): BelongsTo
    {
        return $this->belongsTo(SupplierProduct::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function scopeNeedsAttention(Builder $query): Builder
    {
        return $query->whereIn('status', PriceChangeLogStatus::needsAttention());
    }
}
