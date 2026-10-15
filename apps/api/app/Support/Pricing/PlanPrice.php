<?php

declare(strict_types=1);

namespace App\Support\Pricing;

use App\Models\Product;
use App\Models\ProductPlanPrice;
use App\Models\User;
use App\Support\Membership\DefaultPlan;
use App\Support\Membership\MembershipResolver;
use Illuminate\Support\Facades\Log;

/**
 * What a given customer pays for a given product.
 *
 * Replaces `RolePrice`, which matched a role name against one of four fixed
 * columns and therefore capped the platform at four tiers. Price now comes from
 * `product_plan_prices`, keyed on the customer's membership plan, so the number
 * of tiers is a data question.
 *
 * Shared by checkout and the public catalogue so the quoted price and the
 * billed price come from one implementation. Guests resolve to the default
 * plan, which is the pre-existing behaviour said in the new vocabulary.
 */
final class PlanPrice
{
    /** Throttles the fallback warning so one bad deploy cannot flood the log. */
    private static bool $fallbackWarned = false;

    /**
     * Clears the throttle. The flag is process-wide, so it otherwise outlives the
     * test that tripped it and silently silences the next test's assertion — the
     * same reasoning `DefaultPlan` gives for not memoising across a
     * `RefreshDatabase` boundary.
     */
    public static function forgetFallbackWarning(): void
    {
        self::$fallbackWarned = false;
    }

    public static function for(Product $product, ?User $user): int
    {
        return self::forWithPlan($product, $user)['price'];
    }

    /**
     * The price AND the tier it came from, resolved in one pass so the two can
     * never disagree — the admin shows "which price list was this sold on"
     * beside the figure, and a second resolution could answer differently.
     *
     * `planId` is null when no plan price existed and `price_member` answered.
     *
     * @return array{price:int, planId:?int}
     */
    public static function forWithPlan(Product $product, ?User $user): array
    {
        ['price' => $listPrice, 'planId' => $planId] = self::listPriceWithPlan($product, $user);

        // The product's own standing discount first, then the flash sale. Both
        // only ever lower, so the cheaper wins; the undiscounted figure stays
        // available through `listFor()` as the strikethrough price.
        $discounted = ProductDiscount::for($product, $listPrice);
        $salePrice = FlashSalePrice::forProduct((int) $product->getKey());

        // Making this the single place a promotion is applied is what keeps the
        // homepage, the price list and the invoice agreeing — they all resolve
        // through here.
        return [
            'price' => $salePrice !== null && $salePrice < $discounted ? $salePrice : $discounted,
            'planId' => $planId,
        ];
    }

    /**
     * The price with no promotion applied — the strikethrough figure the
     * catalogue shows beside a discounted price.
     */
    public static function listFor(Product $product, ?User $user): int
    {
        return self::listPriceWithPlan($product, $user)['price'];
    }

    /**
     * The price with no promotion applied — the plan tier, the default tier, or
     * `price_member` as the last resort — together with the tier that supplied
     * it.
     *
     * @return array{price:int, planId:?int}
     */
    private static function listPriceWithPlan(Product $product, ?User $user): array
    {
        $planId = MembershipResolver::planIdFor($user);

        if ($planId !== null) {
            $price = self::priceOnPlan($product, $planId);

            if ($price !== null) {
                return ['price' => $price, 'planId' => $planId];
            }
        }

        // The plan has no row for this product — a plan added after the last
        // repricing run. The default tier is the honest answer: never more than
        // the customer expected to pay.
        $defaultPlanId = DefaultPlan::id();

        if ($defaultPlanId !== null && $defaultPlanId !== $planId) {
            $price = self::priceOnPlan($product, $defaultPlanId);

            if ($price !== null) {
                return ['price' => $price, 'planId' => $defaultPlanId];
            }
        }

        // Nothing priced at all. `products.price_member` is NOT NULL, so this
        // always answers — but reaching it means `pricing:backfill-plan-prices`
        // never ran, and every paying member is being sold at the base price.
        // That is a silent revenue leak, not an outage, so it must be noisy.
        self::warnOnce($product);

        return ['price' => (int) $product->price_member, 'planId' => null];
    }

    /**
     * The eager-loaded collection is preferred over a query on purpose: the
     * catalogue resolves a user from a bearer token and maps every row through
     * here, so a lazy load per product would turn one listing into N queries.
     * `ListGameProductsAction` loads `planPrices` for exactly this reason.
     */
    private static function priceOnPlan(Product $product, int $planId): ?int
    {
        if ($product->relationLoaded('planPrices')) {
            $row = $product->getRelation('planPrices')
                ->firstWhere('membership_plan_id', $planId);

            return $row ? (int) $row->price : null;
        }

        $price = ProductPlanPrice::query()
            ->where('product_id', $product->getKey())
            ->where('membership_plan_id', $planId)
            ->value('price');

        return $price === null ? null : (int) $price;
    }

    private static function warnOnce(Product $product): void
    {
        if (self::$fallbackWarned) {
            return;
        }

        self::$fallbackWarned = true;

        Log::warning(
            "PlanPrice: no plan price for product {$product->getKey()}; "
            .'falling back to price_member. Run `pricing:backfill-plan-prices`.'
        );
    }
}
