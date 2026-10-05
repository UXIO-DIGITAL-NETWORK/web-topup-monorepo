<?php

namespace App\Actions\Product;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Pricing\WritePlanPricesAction;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Models\SupplierProduct;
use App\Models\SupplierProductMargin;
use App\Services\ProductRepricer;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Stores per-plan profit-margin overrides and price limits on a provider mapping.
 *
 * For a promoted mapping it also recomputes the linked product's selling prices
 * from its cost. For a pooled one there is no product yet, so the numbers are
 * simply held until promote reads them — which is the whole point of pricing a
 * SKU before it becomes sellable.
 *
 * A null margin for a tier falls back to the pricing rules. That is a legitimate
 * choice, which is why `margin_set_at` is stamped either way: the promote gate
 * asks "did an admin decide?", not "is there a number?".
 */
class SetSupplierProductMarginAction
{
    public function __construct(
        private ProductRepricer $repricer,
        private WritePlanPricesAction $writePlanPrices,
        private CreateActivityLogAction $activityLogAction,
    ) {}

    /**
     * @param  array<int,float|null>  $margins  Keyed by membership plan id. A plan
     *                                          present with null means "use the
     *                                          pricing rules"; a plan absent is
     *                                          left exactly as it was.
     */
    public function execute(
        SupplierProduct $supplierProduct,
        array $margins,
        ?int $priceMin = null,
        ?int $priceMax = null,
        bool $limitsProvided = false,
        ?float $pointPercent = null,
        ?int $pointFlat = null,
        bool $pointsProvided = false,
        ?int $dailyOrderLimit = null,
        bool $dailyLimitProvided = false,
    ): SupplierProduct {
        return DB::transaction(function () use ($supplierProduct, $margins, $priceMin, $priceMax, $limitsProvided, $pointPercent, $pointFlat, $pointsProvided, $dailyOrderLimit, $dailyLimitProvided) {
            // `margin_set_at` is stamped either way: the promote gate asks
            // "did an admin decide?", and deciding to fall back to the rules is
            // still deciding.
            $attributes = ['margin_set_at' => now()];

            // Only touch the limits when the caller actually sent them, so saving
            // margins from a form without the limit fields does not silently clear
            // a window someone set earlier.
            if ($limitsProvided) {
                $attributes['price_min'] = $priceMin;
                $attributes['price_max'] = $priceMax;
            }

            // Points ride along with the margins for the same reason the limits
            // do: they are decided in the same form, and a pooled row has no
            // product to hold them until promote copies them across.
            if ($pointsProvided) {
                $attributes['point_percent'] = $pointPercent;
                $attributes['point_flat'] = $pointFlat;
            }

            // The day's selling allowance — a local quota, decided in this form
            // because it is a property of the supply, next to the cost the prices
            // are derived from. Null clears it back to unlimited.
            if ($dailyLimitProvided) {
                $attributes['daily_order_limit'] = $dailyOrderLimit;
            }

            $supplierProduct->update($attributes);
            $this->writeMargins($supplierProduct, $margins);
            $supplierProduct->refresh();

            $product = $supplierProduct->product;

            if ($product) {
                if ($limitsProvided) {
                    $product->update(['price_min' => $priceMin, 'price_max' => $priceMax]);
                    $product->refresh();
                }

                // An already-promoted SKU must not need a second trip to the
                // product form for the points the admin just decided here.
                if ($pointsProvided) {
                    $product->update(['point_percent' => $pointPercent, 'point_flat' => $pointFlat]);
                    $product->refresh();
                }

                // A mix is priced from its accumulated cost (own SKU + every
                // component); re-pricing it from this one mapping's price would
                // silently drop the components from the figure.
                $cost = $product->isMix() ? (int) $product->price_modal : (int) $supplierProduct->price;

                // The real prices, one per plan.
                $this->writePlanPrices->execute(
                    $product,
                    $this->repricer->computeForPlans($cost, $product, $supplierProduct),
                );

                // The frozen legacy columns, until they are dropped. Written
                // after the plan prices so `price_member` is not clobbered by
                // the bridge's own idea of the default tier.
                $legacy = $this->repricer->compute($cost, $product, $supplierProduct);
                unset($legacy['price_member']);
                $product->update($legacy);
            }

            $this->activityLogAction->execute(new CreateActivityLogDTO(
                userId: Auth::id(),
                ipAddress: request()->ip(),
                userAgent: request()->userAgent(),
                message: "Set profit margin for provider SKU: {$supplierProduct->buyer_sku_code}"
            ));

            return $supplierProduct->fresh(['product', 'supplier', 'poolCategory']);
        });
    }

    /**
     * Upsert the authored margins, deleting the ones explicitly cleared.
     *
     * A null is a real instruction ("use the pricing rules"), so it removes the
     * row rather than storing zero — a stored 0% would sell at cost.
     *
     * @param  array<int,float|null>  $margins
     */
    private function writeMargins(SupplierProduct $supplierProduct, array $margins): void
    {
        foreach ($margins as $planId => $margin) {
            if ($margin === null) {
                SupplierProductMargin::query()
                    ->where('supplier_product_id', $supplierProduct->getKey())
                    ->where('membership_plan_id', $planId)
                    ->delete();

                continue;
            }

            SupplierProductMargin::updateOrCreate(
                ['supplier_product_id' => $supplierProduct->getKey(), 'membership_plan_id' => $planId],
                ['margin_percent' => $margin],
            );
        }
    }
}
