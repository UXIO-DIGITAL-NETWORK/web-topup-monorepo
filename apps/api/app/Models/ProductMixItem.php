<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One component of a mix product: another product, and how many of it.
 *
 * The mix product itself does the selling and the pricing; this row only says
 * what has to be fulfilled. `cost()` is the arithmetic the pricing path reads,
 * kept here so the accumulated cost has exactly one definition.
 */
class ProductMixItem extends Model
{
    protected $guarded = ['id'];

    protected $casts = [
        'quantity' => 'integer',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * withTrashed: an archived component still has to be readable for the
     * history of a mix that sold while it was live. It cannot be added anew —
     * the action refuses a trashed component.
     */
    public function component()
    {
        return $this->belongsTo(Product::class, 'component_product_id')->withTrashed();
    }

    /** What this line adds to the mix's cost, in whole rupiah. */
    public function cost(): int
    {
        return (int) ($this->component?->price_modal ?? 0) * (int) $this->quantity;
    }
}
