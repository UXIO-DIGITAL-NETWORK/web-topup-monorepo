<?php

declare(strict_types=1);

namespace App\Actions\Storefront;

use App\Actions\Uxiolabs\SyncSupplierProductAction;
use App\Contracts\SupplierGateway;
use App\Enums\PriceChangeLogSource;
use App\Models\PriceChangeLog;
use App\Models\Product;
use App\Models\SupplierProduct;
use App\Models\User;
use App\Support\Pricing\PlanPrice;
use App\Support\Uxiolabs\PriceCheckLock;
use App\Support\Uxiolabs\PriceListSync;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * "Is this item still the price and availability we think it is?" — asked at the
 * moment a buyer picks a package, so the button they are about to press is
 * standing on data that was checked just now rather than up to five minutes ago.
 *
 * The answer is always one of four, and never an exception:
 *
 *  - `ok`            nothing moved (or we could not look, and what we hold is fresh)
 *  - `price_changed` the billed price moved — the caller decides whether to show it
 *                    or ask; downward is harmless, upward needs a human "yes"
 *  - `unavailable`   the provider switched it off — nobody can buy it until fixed
 *  - `unknown`       we could not look AND the stored list is stale, so the honest
 *                    answer is "not sure", not a guess
 *
 * It writes. That is the point: a change noticed here updates the mapping, the
 * selling prices and the audit trail immediately, exactly as the 5-minute sweep
 * would have — through the same action, under the same lock, so the two can never
 * be mid-write against each other or disagree about the rule.
 */
class RecheckCheckoutItemAction
{
    /**
     * A fetch this recent is shared: buyers picking packages seconds apart should
     * cost the provider one call, not one each.
     */
    private const FETCH_WINDOW_SECONDS = 20;

    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly SyncSupplierProductAction $syncProduct,
    ) {}

    /**
     * @return array{outcome:string, price:int, previous_price:int, available:bool, freshness:string, checked_at:string}
     */
    public function execute(Product $product, ?User $user): array
    {
        $before = PlanPrice::forWithPlan($product, $user)['price'];

        $mappings = $this->mappingsFor($product);

        if ($mappings->isEmpty()) {
            // The answer checkout itself would give: nothing active to sell.
            return $this->result('unavailable', $before, $before, false, 'none');
        }

        [$items, $freshness] = $this->providerItems();

        if ($items === null) {
            // We could not look. Fresh-enough stored data still answers the
            // question; stale data means we genuinely do not know.
            $outcome = PriceListSync::isFresh($this->freshMinutes()) ? 'ok' : 'unknown';

            return $this->result($outcome, $before, $before, true, $freshness);
        }

        $available = true;

        foreach ($mappings as $mapping) {
            $item = $items[(string) $mapping->buyer_sku_code] ?? null;

            if ($item === null) {
                // Absent from the list is NOT "unavailable". The sweep reports a
                // vanished SKU rather than deactivating it, precisely so a provider
                // list glitch cannot take the whole catalogue off sale; the stored
                // row and the margin guard stay the authority here too.
                continue;
            }

            $sync = $this->syncProduct->execute($mapping, $item, now(), PriceChangeLogSource::CHECKOUT);

            if ($sync->upsertRow !== null) {
                SyncSupplierProductAction::upsert([$sync->upsertRow]);
            }

            if ($sync->logRow !== null) {
                // Same shape and same table as the sweep's rows, so the audit trail
                // reads as one list — only `source` says who noticed.
                PriceChangeLog::insert($sync->logRow);
            }

            if (! $sync->isActive) {
                $available = false;
            }
        }

        // Read the billed price back off a fresh instance: the write above updated
        // `product_plan_prices`, and the instance in hand may still hold the old
        // relation.
        $after = PlanPrice::forWithPlan($product->fresh(), $user)['price'];

        if (! $available) {
            return $this->result('unavailable', $after, $before, false, $freshness);
        }

        if ($after !== $before) {
            return $this->result('price_changed', $after, $before, true, $freshness);
        }

        return $this->result('ok', $after, $before, true, $freshness);
    }

    /**
     * Every mapping that has to be live for this item to be sellable: its own, plus
     * — for a mix — each component's, because a bundle is delivered by its parts.
     *
     * @return Collection<int,SupplierProduct>
     */
    private function mappingsFor(Product $product): Collection
    {
        $mappings = SupplierProduct::query()
            ->where('product_id', $product->id)
            ->where('is_active', true)
            ->with('product')
            ->get();

        if (! $product->isMix()) {
            return $mappings;
        }

        foreach ($product->mixItems()->with('component')->get() as $item) {
            $component = $item->component;

            if ($component === null) {
                continue;
            }

            $mappings = $mappings->merge(
                SupplierProduct::query()
                    ->where('product_id', $component->id)
                    ->where('is_active', true)
                    ->with('product')
                    ->get()
            );
        }

        return $mappings;
    }

    /**
     * The provider's catalogue, keyed by service id.
     *
     * `[null, ...]` means we could not obtain it at all — the caller decides what
     * that means. Everything here is bounded: one fetch at most, inside the shared
     * lock, and never a fetch triggered by a cache read.
     *
     * @return array{0: array<string,array<string,mixed>>|null, 1: string}
     */
    private function providerItems(): array
    {
        if (PriceListSync::fetchedWithin(self::FETCH_WINDOW_SECONDS)) {
            $recent = $this->cachedItems();

            if ($recent !== null) {
                return [$recent, 'recent'];
            }
        }

        try {
            $fetched = PriceCheckLock::attempt(function () {
                $items = $this->uxiolabsService->getPriceList();

                Cache::put(
                    $this->uxiolabsService->priceListCacheKey(),
                    $items,
                    $this->uxiolabsService->priceListCacheTtl()
                );
                PriceListSync::markFetched();

                return $items;
            });
        } catch (Throwable $e) {
            // Unreachable, timing out, or answering nonsense — none of which is the
            // buyer's problem. A failed *check* must never fail the sale, so this
            // degrades to what we hold exactly like the sweep's own failures do.
            Log::channel('uxiolabs')->warning('storefront re-check could not reach the provider', [
                'error' => $e->getMessage(),
            ]);

            $fetched = null;
        }

        if ($fetched !== null) {
            return [$this->keyBySku($fetched), 'fresh'];
        }

        // The lock is held, which means a sweep is fetching right now: the snapshot
        // it just wrote to the shared cache is newer than anything else we could get
        // without a second call to the provider.
        $cached = $this->cachedItems();

        return [$cached, 'sweep'];
    }

    /**
     * A plain cache read — never `getPriceListCached()`, whose `remember()` would
     * fetch on a miss and put an unguarded call on the checkout path.
     *
     * @return array<string,array<string,mixed>>|null
     */
    private function cachedItems(): ?array
    {
        $cached = Cache::get($this->uxiolabsService->priceListCacheKey());

        return is_array($cached) ? $this->keyBySku($cached) : null;
    }

    /**
     * @param  array<int,array<string,mixed>>  $items
     * @return array<string,array<string,mixed>>
     */
    private function keyBySku(array $items): array
    {
        $keyed = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $sku = (string) ($item['id'] ?? '');

            if ($sku !== '') {
                $keyed[$sku] = $item;
            }
        }

        return $keyed;
    }

    private function freshMinutes(): int
    {
        return (int) config('services.uxiolabs.recheck_fresh_minutes', 5);
    }

    /**
     * @return array{outcome:string, price:int, previous_price:int, available:bool, freshness:string, checked_at:string}
     */
    private function result(string $outcome, int $price, int $previous, bool $available, string $freshness): array
    {
        return [
            'outcome' => $outcome,
            'price' => $price,
            'previous_price' => $previous,
            'available' => $available,
            'freshness' => $freshness,
            'checked_at' => now()->toIso8601String(),
        ];
    }
}
