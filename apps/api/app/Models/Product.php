<?php

namespace App\Models;

use App\Support\Storefront\Catalog;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use HasFactory, SoftDeletes;

    /** Promoted from the pool but never published — invisible to the storefront. */
    public const STATE_DRAFT = 'draft';

    /** Live: active AND served by an active supplier mapping. */
    public const STATE_PUBLISHED = 'published';

    /** Was published, then deliberately taken down. */
    public const STATE_UNPUBLISHED = 'unpublished';

    /** Archived. The row survives so its order history keeps resolving. */
    public const STATE_ARCHIVED = 'archived';

    protected $guarded = ['id'];

    protected $casts = [
        'is_price_locked' => 'boolean',
        'is_price_hidden' => 'boolean',
        'price_min' => 'integer',
        'price_max' => 'integer',
        'discount_value' => 'integer',
        'published_at' => 'datetime',
    ];

    /** Never published, as opposed to published-then-deactivated. */
    /** Selling price per membership plan — see `App\Support\Pricing\PlanPrice`. */
    public function planPrices()
    {
        return $this->hasMany(ProductPlanPrice::class);
    }

    public function isDraft(): bool
    {
        return ! $this->status && $this->published_at === null;
    }

    /**
     * The single definition of where this product sits in its lifecycle.
     *
     * PUBLISHED means exactly what `Catalog::sellableProducts()` means — active
     * AND carrying an active supplier mapping. Reading `status` alone is what
     * made "Activate" a lie: it produced products the admin was told were live
     * while the storefront could not see them, because checkout needs a supplier
     * to order from and the mapping was still off.
     *
     * Pass an already-loaded `supplierProducts` collection to keep this free of
     * queries inside a list — `GetProductsAction` eager-loads it for that reason.
     */
    public function publishState(): string
    {
        if ($this->trashed()) {
            return self::STATE_ARCHIVED;
        }

        if ($this->status && $this->supplierProducts->contains(fn ($mapping) => (bool) $mapping->is_active)) {
            return self::STATE_PUBLISHED;
        }

        // A mix has no mapping of its own: it is live when every component of it
        // is. Read from the LOADED relation only — this runs once per row in a
        // list, so a query here would turn one page into N+1; `GetProductsAction`
        // eager-loads it for that reason.
        if ($this->status
            && $this->relationLoaded('mixItems')
            && $this->mixItems->isNotEmpty()
            && $this->mixItems->every(fn (ProductMixItem $item) => $item->component !== null && Catalog::isSellable($item->component))) {
            return self::STATE_PUBLISHED;
        }

        return $this->isDraft() ? self::STATE_DRAFT : self::STATE_UNPUBLISHED;
    }

    /**
     * The mapping a publish would activate: the live one if there is one, else
     * the most recently touched. Null when the product has no supplier at all,
     * which is the one thing publishing cannot work around.
     */
    public function publishableMapping(): ?SupplierProduct
    {
        return $this->supplierProducts
            ->sortByDesc(fn (SupplierProduct $mapping) => [(bool) $mapping->is_active, $mapping->updated_at])
            ->first();
    }

    /** Null when the product may be published; otherwise the reason it may not. */
    public function publishBlockedReason(): ?string
    {
        if ($this->trashed()) {
            return 'Produk sudah diarsipkan. Pulihkan terlebih dahulu.';
        }

        if ($this->isMix()) {
            $this->loadMissing('mixItems.component');

            if ($this->mixItems->contains(fn (ProductMixItem $item) => $item->component === null || $item->component->trashed())) {
                return 'Ada komponen mix yang sudah dihapus.';
            }

            if (! $this->mixItems->every(fn (ProductMixItem $item) => Catalog::isSellable($item->component))) {
                return 'Semua komponen mix harus sudah tayang dulu sebelum mix-nya bisa ditayangkan.';
            }

            return null;
        }

        $mapping = $this->publishableMapping();

        if ($mapping === null) {
            return 'Produk belum punya mapping supplier.';
        }

        if (! $mapping->buyer_product_status) {
            return 'SKU sedang nonaktif di provider.';
        }

        return null;
    }

    public function canPublish(): bool
    {
        return $this->publishBlockedReason() === null;
    }

    /** The "client" (merchant) that sells this product; null for platform-owned catalogue. */
    public function merchant()
    {
        return $this->belongsTo(User::class, 'merchant_id');
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function subCategory()
    {
        return $this->belongsTo(SubCategory::class);
    }

    public function supplierProducts()
    {
        return $this->hasMany(SupplierProduct::class);
    }

    /**
     * The products this one sells together — its mix. Empty for a normal
     * product, which is why `isMix()` reads the collection rather than a flag.
     */
    public function mixItems()
    {
        return $this->hasMany(ProductMixItem::class);
    }

    /** The components themselves, with the quantity each contributes. */
    public function components()
    {
        return $this->belongsToMany(Product::class, 'product_mix_items', 'product_id', 'component_product_id')
            ->withPivot('quantity')
            ->withTimestamps();
    }

    public function isMix(): bool
    {
        return $this->relationLoaded('mixItems')
            ? $this->mixItems->isNotEmpty()
            : $this->mixItems()->exists();
    }
}
