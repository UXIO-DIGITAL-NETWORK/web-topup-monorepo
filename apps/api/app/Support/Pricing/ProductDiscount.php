<?php

declare(strict_types=1);

namespace App\Support\Pricing;

use App\Models\Product;

/**
 * A standing, per-product discount — the number behind the strikethrough price.
 *
 * Separate from `FlashSalePrice` (time-boxed, stock-limited, its own screen) and
 * from promo codes (typed by the customer at checkout) because this one belongs
 * to the product itself and never expires. It exists so the admin can price a
 * cut once instead of scheduling a sale window.
 *
 * Rule, identical to the flash sale's: a discount only ever LOWERS the price the
 * customer pays, and never below zero. `PlanPrice` consults this so the
 * catalogue and checkout still quote from one implementation.
 */
final class ProductDiscount
{
    public const TYPE_PERCENT = 'percent';

    public const TYPE_FIXED = 'fixed';

    /** The discounted price, given the price it applies to. */
    public static function for(Product $product, int $price): int
    {
        $type = $product->discount_type;
        $value = $product->discount_value;

        // null is "no discount configured" — deliberately not the same as 0,
        // which the form can transiently hold while the admin clears it.
        if ($type === null || $value === null || (int) $value <= 0) {
            return $price;
        }

        $cut = $type === self::TYPE_PERCENT
            ? (int) round($price * (int) $value / 100)
            : (int) $value;

        return max($price - $cut, 0);
    }

    /** True when this product carries a discount worth showing. */
    public static function applies(Product $product): bool
    {
        return $product->discount_type !== null
            && $product->discount_value !== null
            && (int) $product->discount_value > 0;
    }
}
