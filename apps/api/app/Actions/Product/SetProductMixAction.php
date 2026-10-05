<?php

declare(strict_types=1);

namespace App\Actions\Product;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Pricing\WritePlanPricesAction;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Exceptions\ProductDraftException;
use App\Models\Product;
use App\Services\PricingService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Sets a product's mix — which other products it sells together.
 *
 * Three things this owns, in this order:
 *
 *  1. **The composition** (replace-in-place, one row per component).
 *  2. **The accumulated cost**: `products.price_modal` becomes the sum of the
 *     components' costs times their quantities. That column is what the whole
 *     pricing path reads, so writing it here is what makes every downstream
 *     price, margin and guard agree without any of them knowing about mixes.
 *  3. **The sell prices**, recomputed from the NEW cost using the margin the
 *     product already sold at — so editing a mix moves the price with the cost
 *     instead of silently leaving the old margin behind.
 *
 * Nesting is refused: a mix of a mix would make "the components" a moving
 * target for fulfilment, and nothing in the product asks for it.
 */
class SetProductMixAction
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly WritePlanPricesAction $writePlanPrices,
        private readonly CreateActivityLogAction $activityLogAction,
    ) {}

    /**
     * @param  array<int,array{product_id:int|string,quantity:int|string}>  $items
     *
     * @throws ProductDraftException
     */
    public function execute(Product $product, array $items): Product
    {
        if ($product->trashed()) {
            throw new ProductDraftException('Produk sudah diarsipkan.');
        }

        $normalized = $this->validate($product, $items);

        return DB::transaction(function () use ($product, $normalized) {
            $oldCost = (int) $product->price_modal;
            // Read BEFORE the rows are replaced: the margin the admin chose is
            // implied by the price/cost pair that is on screen right now.
            $margins = $this->effectiveMargins($product, $oldCost);

            $product->mixItems()->delete();

            foreach ($normalized as $row) {
                // `product_id` is filled by the relation itself — this row's own
                // column is the component.
                $product->mixItems()->create([
                    'component_product_id' => $row['product_id'],
                    'quantity' => $row['quantity'],
                ]);
            }

            $product->load('mixItems.component');

            if ($product->mixItems->isEmpty()) {
                // Cleared: the product goes back to being an ordinary one and the
                // admin prices it by hand — nothing to accumulate.
                $this->log($product, 'Mix dikosongkan');

                return $product->fresh(['mixItems.component']);
            }

            $cost = (int) $product->mixItems->sum(fn ($item) => $item->cost());

            $product->update(['price_modal' => $cost]);

            if ($cost > 0 && $product->planPrices()->exists()) {
                $this->writePlanPrices->execute(
                    $product,
                    $this->pricing->computePlanPrices(
                        $cost,
                        $product->category_id !== null ? (int) $product->category_id : null,
                        $margins,
                        $product->price_min,
                        $product->price_max,
                    ),
                );
            }

            $this->log($product, 'Mix diset: '.count($normalized).' komponen, modal terakumulasi '.$cost);

            return $product->fresh(['mixItems.component']);
        });
    }

    /**
     * @param  array<int,array{product_id:int|string,quantity:int|string}>  $items
     * @return array<int,array{product_id:int,quantity:int}>
     *
     * @throws ProductDraftException
     */
    private function validate(Product $product, array $items): array
    {
        $normalized = [];
        $seen = [];

        foreach ($items as $item) {
            $componentId = (int) $item['product_id'];
            $quantity = (int) $item['quantity'];

            if ($componentId <= 0) {
                throw new ProductDraftException('Komponen mix tidak valid.');
            }

            if ($quantity < 1) {
                throw new ProductDraftException('Jumlah komponen mix minimal 1.');
            }

            if ($componentId === (int) $product->getKey()) {
                throw new ProductDraftException('Sebuah produk tidak boleh menjadi komponen dirinya sendiri.');
            }

            if (isset($seen[$componentId])) {
                throw new ProductDraftException('Komponen yang sama muncul lebih dari sekali.');
            }

            $component = Product::withTrashed()->find($componentId);

            if ($component === null || $component->trashed()) {
                throw new ProductDraftException('Komponen mix tidak ditemukan.');
            }

            if ($component->isMix()) {
                throw new ProductDraftException('Produk mix tidak boleh menjadi komponen mix lain.');
            }

            $seen[$componentId] = true;
            $normalized[] = ['product_id' => $componentId, 'quantity' => $quantity];
        }

        return $normalized;
    }

    /**
     * Each plan's implied margin, derived from the price it currently sells at.
     *
     * Derived rather than authored because a mix product has no supplier mapping
     * — `supplier_product_margins` is keyed on one — so the stored price is the
     * only record of what the admin decided. A plan with no row is left to the
     * pricing rules, exactly as `computePlanPrices` treats an absent override.
     *
     * @return array<int,float>
     */
    private function effectiveMargins(Product $product, int $oldCost): array
    {
        if ($oldCost <= 0) {
            return [];
        }

        $margins = [];

        foreach ($product->planPrices()->get() as $row) {
            $price = (int) $row->price;

            if ($price > 0) {
                $margins[(int) $row->membership_plan_id] = (($price / $oldCost) - 1) * 100;
            }
        }

        return $margins;
    }

    private function log(Product $product, string $message): void
    {
        $this->activityLogAction->execute(new CreateActivityLogDTO(
            userId: Auth::id(),
            ipAddress: request()->ip(),
            userAgent: request()->userAgent(),
            message: "{$message} — {$product->code}",
        ));
    }
}
