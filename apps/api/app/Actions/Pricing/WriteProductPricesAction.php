<?php

declare(strict_types=1);

namespace App\Actions\Pricing;

use App\Models\Product;
use App\Models\ProductPlanPrice;
use App\Models\SupplierProduct;
use App\Services\ProductRepricer;
use App\Support\Membership\DefaultPlan;

/**
 * The one way a product's selling prices are written.
 *
 * Two tables describe them: `product_plan_prices`, which is what `PlanPrice`
 * quotes and bills, and the legacy `products.price_*` columns, which six
 * sort/filter queries and the price change log read. `price_member` mirrors the
 * default plan's row, and that mirror is the invariant `pricing:verify` guards.
 *
 * A writer that touches one table and not the other drifts them apart, and the
 * drift is silent — the storefront keeps billing the plan row while the admin
 * list and the change log show the column. That is exactly what happened: the
 * scheduled price checker repriced `price_member` whenever a cost moved and
 * never touched the table customers are charged from, so "Harga jual diperbarui
 * otomatis" was logged for a price nobody was ever charged.
 *
 * @see WritePlanPricesAction the single writer of the plan rows themselves
 */
final class WriteProductPricesAction
{
    public function __construct(
        private readonly WritePlanPricesAction $writePlanPrices,
        private readonly ProductRepricer $repricer,
    ) {}

    /**
     * Write the prices a mapping's cost and authored margins imply.
     *
     * Returns the price each tier is ACTUALLY billed at, read back after the
     * write, because the caller that has to record them — the price change log —
     * must not claim a number nobody is charged.
     *
     * @return array{price_modal:int,price_member:int,price_vip:int,price_reseller:int,price_agent:int}
     */
    public function fromCost(Product $product, int $cost, SupplierProduct $mapping, bool $overwriteManual = false): array
    {
        // A mix's cost is its accumulated own-plus-components figure, not the
        // mapping's price. A caller re-pricing a mapped mix from its own SKU's
        // cost must not overwrite that with the own SKU alone — the accumulated
        // `price_modal` is the source of truth for a mix.
        if ($product->isMix()) {
            $cost = (int) $product->price_modal;
        }

        $legacy = $this->repricer->compute($cost, $product, $mapping);

        $this->forPlans($product, $this->repricer->computeForPlans($cost, $product, $mapping), $overwriteManual);

        // The frozen columns are written *after* the plan rows, and without
        // `price_member`: that column now belongs to WritePlanPricesAction, and
        // letting this bridge's own idea of the default tier land on top of it
        // is the drift this action exists to prevent.
        unset($legacy['price_member']);
        $product->update($legacy);

        return $this->billedTiers($product, $legacy);
    }

    /**
     * What each tier is charged once the write is done — read back, not assumed.
     *
     * The legacy columns are only ever a COPY of one tier each, and a plan row
     * marked manual is deliberately skipped by `WritePlanPricesAction`. Handing
     * back the computed set therefore lets `price_change_logs` claim a VIP price
     * that no VIP customer pays, while the column and the log move together and
     * only the billed row stands still. Logging the billed value costs one query
     * per changed product and removes the whole class.
     *
     * @param  array<string,int>  $written  The legacy columns just written, for tiers with no plan row of their own
     * @return array{price_modal:int,price_member:int,price_vip:int,price_reseller:int,price_agent:int}
     */
    private function billedTiers(Product $product, array $written): array
    {
        $prices = ProductPlanPrice::query()
            ->where('product_id', $product->getKey())
            ->pluck('price', 'membership_plan_id');

        $tiers = ['price_modal' => (int) ($written['price_modal'] ?? 0)];

        // Which plan id carries which legacy tier.
        foreach (array_flip(ProductRepricer::planIdByRole()) as $planId => $role) {
            if (isset($prices[$planId])) {
                $tiers['price_'.$role] = (int) $prices[$planId];
            }
        }

        // A tier with no plan row of its own keeps the column this write just put
        // there — an install with no role-linked plans prices every tier off the
        // default one, and those columns are where that lands.
        foreach (['price_vip', 'price_reseller', 'price_agent'] as $tier) {
            $tiers[$tier] ??= (int) ($written[$tier] ?? 0);
        }

        // The default tier is the one that owns both the plan row and the column,
        // and the write re-synced the column from the row.
        $tiers['price_member'] = (int) $product->price_member;

        return $tiers;
    }

    /**
     * Write explicit prices, keyed by membership plan id.
     *
     * @param  array<int, int>  $planPrices
     */
    public function forPlans(Product $product, array $planPrices, bool $overwriteManual = false): void
    {
        $this->writePlanPrices->execute($product, $planPrices, $overwriteManual);
    }

    /**
     * Write the price an admin typed for the default tier.
     *
     * `price_member` is where that number has always been entered on the product
     * form, and the default plan's row is where it is billed from now, so the two
     * have to be written together. A manual row is overwritten: the admin is
     * typing this price right now, which makes an earlier one the thing they mean
     * to replace.
     */
    public function forDefaultPlan(Product $product, int $price): void
    {
        $defaultPlanId = DefaultPlan::id();

        if ($defaultPlanId !== null) {
            $this->writePlanPrices->execute($product, [$defaultPlanId => $price], overwriteManual: true);
        }
    }
}
