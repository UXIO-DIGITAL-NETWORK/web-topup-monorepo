<?php

namespace Tests\Feature\Product;

use App\Models\Product;
use App\Support\Pricing\PlanPrice;
use App\Support\Pricing\ProductDiscount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The per-product discount, and the rule it shares with the flash sale: a
 * discount only ever LOWERS what the customer pays.
 *
 * `PlanPrice` is the single place a price is resolved (catalogue and checkout
 * both go through it), so it is also the only place a discount may be applied —
 * otherwise the quoted price and the billed price drift apart.
 */
class ProductDiscountPricingTest extends TestCase
{
    use RefreshDatabase;

    private function product(array $overrides = []): Product
    {
        return Product::factory()->create(array_merge([
            'price_member' => 20000,
        ], $overrides));
    }

    public function test_no_discount_leaves_the_price_alone(): void
    {
        $product = $this->product();

        $this->assertSame(20000, PlanPrice::for($product, null));
        $this->assertFalse(ProductDiscount::applies($product));
    }

    public function test_a_percent_discount_lowers_the_price(): void
    {
        $product = $this->product(['discount_type' => 'percent', 'discount_value' => 10]);

        $this->assertSame(18000, PlanPrice::for($product, null));
    }

    public function test_a_fixed_discount_lowers_the_price(): void
    {
        $product = $this->product(['discount_type' => 'fixed', 'discount_value' => 5000]);

        $this->assertSame(15000, PlanPrice::for($product, null));
    }

    public function test_the_undiscounted_price_stays_available_for_the_strikethrough(): void
    {
        $product = $this->product(['discount_type' => 'percent', 'discount_value' => 10]);

        $this->assertSame(20000, PlanPrice::listFor($product, null));
        $this->assertSame(18000, PlanPrice::for($product, null));
    }

    public function test_a_full_percent_discount_is_free_not_negative(): void
    {
        $product = $this->product(['discount_type' => 'percent', 'discount_value' => 100]);

        $this->assertSame(0, PlanPrice::for($product, null));
    }

    public function test_a_fixed_discount_larger_than_the_price_floors_at_zero(): void
    {
        $product = $this->product(['discount_type' => 'fixed', 'discount_value' => 999999]);

        $this->assertSame(0, PlanPrice::for($product, null));
    }

    public function test_a_zero_discount_is_treated_as_no_discount(): void
    {
        $product = $this->product(['discount_type' => 'percent', 'discount_value' => 0]);

        $this->assertSame(20000, PlanPrice::for($product, null));
        $this->assertFalse(ProductDiscount::applies($product));
    }
}
