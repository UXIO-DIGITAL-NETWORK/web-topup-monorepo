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

        $hasActiveMapping = $this->supplierProducts->contains(fn ($mapping) => (bool) $mapping->is_active);

        // A mix is live when every component of it is AND — when the product
        // still carries its own supplier SKU, because a mix created from a
        // provider SKU orders that SKU too — that SKU is live as well.
        //
        // Checked BEFORE the plain mapping branch below: `hasActiveMapping`
        // alone would call a from-provider mix live while one of its components
        // is switched off, which is exactly the half-deliverable it must not
        // advertise. Read from the LOADED relation only — this runs once per row
        // in a list, so a query here would turn one page into N+1;
        // `GetProductsAction` eager-loads it for that reason.
        if ($this->relationLoaded('mixItems') && $this->mixItems->isNotEmpty()) {
            $componentsLive = $this->mixItems->every(fn (ProductMixItem $item) => $item->component !== null && Catalog::isSellable($item->component));
            $ownLive = $this->supplierProducts->isEmpty() || $hasActiveMapping;

            if ($this->status && $componentsLive && $ownLive) {
                return self::STATE_PUBLISHED;
            }

            return $this->isDraft() ? self::STATE_DRAFT : self::STATE_UNPUBLISHED;
        }

        if ($this->status && $hasActiveMapping) {
            return self::STATE_PUBLISHED;
        }

        return $this->isDraft() ? self::STATE_DRAFT : self::STATE_UNPUBLISHED;
    }

    /**
     * The cost of the product's OWN supplier SKU — not its components'.
     *
     * A mix made from a provider SKU still has that mapping, and that SKU is
     * ordered alongside the components, so its cost belongs in the accumulated
     * modal. Zero for a hand-made bundle with no supplier of its own.
     *
     * Prefers an active mapping (the one fulfilment will actually use) and only
     * falls back to an inactive one, which is the state a draft is in before its
     * first publish.
     */
    public function ownSupplierCost(): int
    {
        return (int) ($this->supplierProducts()->orderByDesc('is_active')->orderBy('id')->value('price') ?? 0);
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

            // A mix created from a provider SKU orders that SKU too, so the SKU
            // has to be alive at the provider. Only the provider's own flag is
            // checked — publishing is what activates the mapping, so requiring an
            // active one here would make publishing impossible.
            $ownMapping = $this->publishableMapping();

            if ($ownMapping !== null && ! $ownMapping->buyer_product_status) {
                return 'SKU utama mix sedang nonaktif di provider.';
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
