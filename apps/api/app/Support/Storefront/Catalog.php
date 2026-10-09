<?php

declare(strict_types=1);

namespace App\Support\Storefront;

use App\Models\Category;
use App\Models\Product;
use App\Support\Points\PointRules;
use App\Support\Stock\DailyStockLimit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The single definition of "what a customer can actually buy".
 *
 * A product is only sellable when it is active AND has at least one active
 * supplier mapping — `CheckoutAction` aborts on a product with no active
 * supplier, so listing one would advertise an order that can only fail at
 * submit time. Every storefront query goes through here so the catalog and
 * checkout can never disagree about what is on sale.
 */
final class Catalog
{
    /**
     * Constrain a Product query to rows checkout would accept.
     *
     * Accepts a Builder or a HasMany relation — `$game->products()` returns the
     * latter, and both forward `where`/`whereHas` to the same underlying query.
     *
     * @template T of Builder|HasMany
     *
     * @param  T  $query
     * @return T
     */
    public static function sellableProducts(Builder|HasMany $query): Builder|HasMany
    {
        // One level deep on purpose: a mix of a mix is refused when the
        // composition is set, so a component is never itself a mix. Recursing
        // here would rebuild this same closure at query-build time, forever.
        $mappingBacked = fn (Builder $component) => $component
            ->where('status', true)
            ->whereNull('deleted_at')
            ->whereHas('supplierProducts', fn (Builder $mapping) => $mapping->where('is_active', true));

        return $query
            ->where('status', true)
            // At least one thing to deliver: its own supplier SKU, or a mix.
            ->where(function (Builder $q) {
                $q->whereHas('supplierProducts', fn (Builder $mapping) => $mapping->where('is_active', true))
                    ->orWhereHas('mixItems');
            })
            // Its OWN supplier SKU, when it has one, must be live. A mix created
            // from a provider SKU is fulfilled by that SKU AND its components, so
            // a mix whose own SKU is switched off is as undeliverable as one with
            // a dead component.
            ->where(function (Builder $q) {
                $q->whereDoesntHave('supplierProducts')
                    ->orWhereHas('supplierProducts', fn (Builder $mapping) => $mapping->where('is_active', true));
            })
            // Every component (for a mix) must itself be deliverable. One level
            // deep on purpose: a mix of a mix is refused when the composition is
            // set, so a component is never itself a mix.
            ->whereDoesntHave('mixItems', fn (Builder $item) => $item->whereDoesntHave(
                'component',
                $mappingBacked,
            ));
    }

    /**
     * The same rule in PHP, for callers holding a model rather than a query —
     * `Product::publishBlockedReason()` has to answer before a save.
     *
     * Kept beside the query on purpose: these two ARE the definition of
     * "sellable", and letting them drift is how the catalogue came to list
     * products checkout would refuse.
     */
    public static function isSellable(Product $product): bool
    {
        if ($product->trashed() || ! $product->status) {
            return false;
        }

        $product->loadMissing(['supplierProducts', 'mixItems.component']);

        $hasActiveMapping = $product->supplierProducts->contains(fn ($mapping) => (bool) $mapping->is_active);

        if ($product->mixItems->isNotEmpty()) {
            // A mix is delivered by its components — and, when it still carries
            // its own provider SKU, by that SKU too. Both halves have to be live.
            if ($product->supplierProducts->isNotEmpty() && ! $hasActiveMapping) {
                return false;
            }

            return $product->mixItems->every(fn ($item) => self::componentIsSellable($item->component));
        }

        return $hasActiveMapping;
    }

    /** A component is a plain product: its own active mapping, nothing more. */
    private static function componentIsSellable(?Product $component): bool
    {
        if ($component === null || $component->trashed() || ! $component->status) {
            return false;
        }

        $component->loadMissing('supplierProducts');

        return $component->supplierProducts->contains(fn ($mapping) => (bool) $mapping->is_active);
    }

    /** Games (categories) that are active and have at least one sellable product. */
    public static function sellableGames(): Builder
    {
        return Category::query()
            ->where('status', true)
            ->whereHas('products', fn (Builder $q) => self::sellableProducts($q));
    }

    /** Sellable products belonging to one game. */
    public static function productsFor(Category $game): HasMany
    {
        return self::sellableProducts($game->products());
    }

    /**
     * Resolve the `{game}` route segment.
     *
     * Accepts slug, code or numeric id: `slug` is nullable on older rows, and
     * the admin panel links games by `code`, so keying on slug alone would
     * 404 half the catalog.
     */
    public static function resolveGame(string $key): ?Category
    {
        return Category::query()
            ->where('status', true)
            ->where(function (Builder $q) use ($key) {
                $q->where('slug', $key)->orWhere('code', $key);

                if (ctype_digit($key)) {
                    $q->orWhere('id', (int) $key);
                }
            })
            ->first();
    }

    /** Two-letter fallback tile shown when a game has no artwork. */
    public static function initials(string $name): string
    {
        return collect(preg_split('/\s+/', trim($name)) ?: [])
            ->filter()
            ->take(2)
            ->map(fn (string $word) => mb_strtoupper(mb_substr($word, 0, 1)))
            ->implode('');
    }

    /** Digits leading a denomination name ("100 Diamonds" → 100), else null. */
    public static function amountFromName(string $name): ?int
    {
        return preg_match('/\d[\d.,]*/', $name, $m) === 1
            ? (int) preg_replace('/\D/', '', $m[0])
            : null;
    }

    /**
     * @param  array{percent: float, flat: int}|null  $pointGlobals  Site-wide
     *                                                               earning rule, read once by the caller when mapping a whole listing.
     * @param  int|null  $stockLeft  Slots left today for this SKU (null = no ceiling); resolved by the caller for
     *                               the whole page in one query, see `DailyStockLimit::remainingFor()`.
     * @return array{id: int, name: string, code: string, price: int, group: string, sub_category_id: int|null, amount: int|null, point_percent: float, point_flat: int, stock_left: int|null, is_sold_out: bool}
     */
    public static function denomination(Product $product, int $price, ?array $pointGlobals = null, ?int $stockLeft = null): array
    {
        $points = PointRules::effectiveRuleFor($product, $pointGlobals);

        return [
            'id' => $product->id,
            'name' => $product->name,
            'code' => $product->code,
            'price' => $price,
            'group' => $product->subCategory?->name ?? 'Lainnya',
            'sub_category_id' => $product->sub_category_id,
            'amount' => self::amountFromName($product->name),
            // The earning rule, already resolved against the global settings —
            // the checkout summary quotes the points a purchase will earn, and
            // it can only match `GrantTransactionPointsAction` if the fallback
            // happens here rather than on the client.
            'point_percent' => $points['percent'],
            'point_flat' => $points['flat'],
            // Today's remaining allowance. Null is "no ceiling", which is what
            // every SKU without an admin-set limit reports — and is deliberately
            // different from 0, which stops the order.
            'stock_left' => $stockLeft,
            'is_sold_out' => DailyStockLimit::isSoldOut($stockLeft),
        ];
    }
}
