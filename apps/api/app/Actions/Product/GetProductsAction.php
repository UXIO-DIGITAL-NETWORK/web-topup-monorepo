<?php

namespace App\Actions\Product;

use App\Models\Product;
use App\Support\Storefront\Catalog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;

class GetProductsAction
{
    /**
     * Filters mirror the admin product list's toolbar: a free-text box over
     * name/code, the category and sub-category selects, a lifecycle filter and a
     * price band on the retail (member) price.
     *
     * `supplierProducts` is eager-loaded because `publish_state` is derived from
     * it — without this the list would resolve the mapping once per row.
     */
    public function execute(
        int $perPage = 15,
        ?string $search = null,
        ?int $categoryId = null,
        ?int $subCategoryId = null,
        ?bool $status = null,
        ?int $minPrice = null,
        ?int $maxPrice = null,
        ?string $publishState = null,
    ): LengthAwarePaginator {
        // `planPrices` is what the admin table renders now: the number of price
        // tiers is data, and the frozen `price_vip/reseller/agent` columns are
        // no longer serialised at all. Eager-loaded with its plan so the table
        // can label each row without a query per product.
        return Product::with(['category', 'subCategory', 'supplierProducts', 'planPrices.membershipPlan', 'mixItems.component'])
            ->when($publishState !== null, fn ($query) => $this->scopeToState($query, $publishState))
            ->when($search, fn ($query) => $query->where(
                fn ($query) => $query->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%")
            ))
            ->when($categoryId, fn ($query) => $query->where('category_id', $categoryId))
            ->when($subCategoryId, fn ($query) => $query->where('sub_category_id', $subCategoryId))
            // Explicit null check: `false` is a meaningful filter value here, so
            // `when($status, ...)` would silently drop "inactive only".
            ->when($status !== null, fn ($query) => $query->where('status', $status))
            ->when($minPrice, fn ($query) => $query->where('price_member', '>=', $minPrice))
            ->when($maxPrice, fn ($query) => $query->where('price_member', '<=', $maxPrice))
            ->latest()
            ->paginate($perPage);
    }

    /**
     * The SQL mirror of `Product::publishState()`. The two must agree, or a
     * filter would hide rows whose badge says they are there.
     */
    private function scopeToState(Builder $query, string $state): Builder
    {
        // Delegated to `Catalog::sellableProducts()` rather than repeated here:
        // that class IS the definition of "checkout would accept it", and a
        // second copy of the rule is exactly how a badge and a filter drift
        // apart — which now matters, because a mix is sellable through its
        // components rather than through a mapping of its own.
        $live = fn (Builder $q) => Catalog::sellableProducts($q);

        return match ($state) {
            Product::STATE_ARCHIVED => $query->onlyTrashed(),
            Product::STATE_PUBLISHED => $live($query),
            // Not live, but it has been before.
            Product::STATE_UNPUBLISHED => $query
                ->whereNotNull('published_at')
                ->whereNot($live),
            Product::STATE_DRAFT => $query->whereNull('published_at')->where('status', false),
            default => $query,
        };
    }
}
