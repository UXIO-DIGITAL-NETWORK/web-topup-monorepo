<?php

namespace Tests\Unit\Support;

use App\Models\MembershipPlan;
use App\Models\Product;
use App\Models\ProductPlanPrice;
use App\Models\Role;
use App\Models\User;
use App\Support\Membership\DefaultPlan;
use App\Support\Pricing\PlanPrice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * The one place a customer is turned into a price. Checkout and the public
 * catalogue both go through it, so a disagreement here is a customer shown one
 * number and billed another.
 */
class PlanPriceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // The fallback warning is throttled process-wide, so a test that reached
        // the fallback first would silence this one's assertion.
        PlanPrice::forgetFallbackWarning();
    }

    private function plan(string $code, int $sortOrder = 2): MembershipPlan
    {
        return MembershipPlan::create([
            'code' => $code,
            'name' => ['id' => ucfirst($code)],
            'price' => 100000,
            'duration_days' => null,
            'is_active' => true,
            'sort_order' => $sortOrder,
        ]);
    }

    private function member(?MembershipPlan $plan): User
    {
        $role = Role::factory()->create(['name' => 'Member']);

        return User::factory()->create([
            'role_id' => $role->id,
            'membership_plan_id' => $plan?->id,
        ]);
    }

    public function test_a_guest_pays_the_default_plan_price(): void
    {
        $product = Product::factory()->create(['price_member' => 25000]);
        ProductPlanPrice::create([
            'product_id' => $product->id,
            'membership_plan_id' => DefaultPlan::id(),
            'price' => 25000,
        ]);

        $this->assertSame(25000, PlanPrice::for($product, null));
    }

    public function test_a_member_pays_their_own_plans_price(): void
    {
        $gold = $this->plan('gold', 3);
        $product = Product::factory()->create(['price_member' => 25000]);

        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => DefaultPlan::id(), 'price' => 25000]);
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => $gold->id, 'price' => 21000]);

        $this->assertSame(21000, PlanPrice::for($product, $this->member($gold)));
    }

    public function test_a_plan_with_no_row_for_this_product_falls_back_to_the_default_tier(): void
    {
        // A plan created after the last repricing run. The default tier is the
        // honest answer — never more than the customer expected to pay.
        $hokage = $this->plan('hokage', 5);
        $product = Product::factory()->create(['price_member' => 25000]);

        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => DefaultPlan::id(), 'price' => 25000]);

        $this->assertSame(25000, PlanPrice::for($product, $this->member($hokage)));
    }

    public function test_a_deactivated_plan_still_prices_the_member_who_holds_it(): void
    {
        // `is_active` hides a plan from the upgrade page; it does not revoke
        // what somebody already bought.
        $gold = $this->plan('gold', 3);
        $product = Product::factory()->create(['price_member' => 25000]);
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => $gold->id, 'price' => 21000]);

        $user = $this->member($gold);
        $gold->update(['is_active' => false]);

        $this->assertSame(21000, PlanPrice::for($product, $user->fresh()));
    }

    public function test_a_deleted_plan_falls_back_to_the_default_tier(): void
    {
        $gold = $this->plan('gold', 3);
        $product = Product::factory()->create(['price_member' => 25000]);
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => DefaultPlan::id(), 'price' => 25000]);
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => $gold->id, 'price' => 21000]);

        $user = $this->member($gold);
        // Deleting a plan reassigns its holders to the default tier — PlanPrice
        // resolves per product row and cannot check existence on each one, so a
        // deleted plan would otherwise keep pricing people from a row the admin
        // can no longer see.
        $gold->delete();

        $this->assertSame(25000, PlanPrice::for($product, $user->fresh()));
    }

    public function test_an_unpriced_product_falls_back_to_price_member_and_warns(): void
    {
        // Reaching this means `pricing:backfill-plan-prices` never ran, which
        // sells to every paying member at the base tier without erroring. The
        // log line is the only thing that makes a silent revenue leak visible.
        Log::spy();

        $gold = $this->plan('gold', 3);
        $product = Product::factory()->create(['price_member' => 25000]);

        $this->assertSame(25000, PlanPrice::for($product, $this->member($gold)));

        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message) => str_contains($message, 'backfill-plan-prices'))
            ->once();
    }

    public function test_an_eager_loaded_relation_is_used_instead_of_a_query(): void
    {
        // The catalogue maps every row through here; a lazy load per product
        // would turn one listing into N queries.
        $gold = $this->plan('gold', 3);
        $product = Product::factory()->create(['price_member' => 25000]);
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => $gold->id, 'price' => 21000]);

        $loaded = Product::with('planPrices')->findOrFail($product->id);

        $this->assertTrue($loaded->relationLoaded('planPrices'));
        $this->assertSame(21000, PlanPrice::for($loaded, $this->member($gold)));
    }
}
