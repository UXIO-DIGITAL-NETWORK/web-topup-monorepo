<?php

namespace Tests\Feature;

use App\Models\MembershipPlan;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\ProductPlanPrice;
use App\Models\Role;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Which price list an order was sold on.
 *
 * The figure alone could not say: the tier was resolved at checkout and thrown
 * away, and re-deriving it later answers a different question (the customer's
 * plan *today*). These tests pin the snapshot — including the two answers that
 * are not a plan at all.
 */
class TransactionMembershipPlanTest extends TestCase
{
    use RefreshDatabase;

    private function plan(string $code, bool $isDefault = false, int $sortOrder = 3): MembershipPlan
    {
        return MembershipPlan::create([
            'code' => $code,
            'name' => ['id' => ucfirst($code)],
            'price' => 0,
            'duration_days' => null,
            'is_active' => true,
            'is_default' => $isDefault,
            'sort_order' => $sortOrder,
        ]);
    }

    private function memberOn(?MembershipPlan $plan): User
    {
        $role = Role::factory()->create(['name' => 'Member']);

        $user = User::factory()->create([
            'role_id' => $role->id,
            'membership_plan_id' => $plan?->id,
            'balance' => 100000,
        ]);

        Sanctum::actingAs($user, ['access-api']);

        return $user;
    }

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    /** Balance checkout, which completes the order inside the request. */
    private function checkout(Product $product, PaymentChannel $channel)
    {
        Mail::fake();
        Http::fake(['*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'success', 'keterangan' => 'SN-1', 'id' => 'UX1']])]);
        config(['services.uxiolabs.api_key' => 'test-api-key']);

        return $this->postJson('/api/v1/checkout', [
            'product_id' => $product->id,
            'payment_channel_id' => $channel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
            'locale' => 'en',
        ]);
    }

    private function sellableProduct(int $memberPrice = 25000): Product
    {
        $product = Product::factory()->create(['price_member' => $memberPrice]);
        SupplierProduct::factory()->for($product)->create(['price' => 10000]);

        return $product;
    }

    public function test_a_checkout_records_the_plan_whose_price_list_was_used(): void
    {
        $gold = $this->plan('gold');
        $product = $this->sellableProduct();
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => $gold->id, 'price' => 21000]);
        $channel = PaymentChannel::factory()->balance()->create();
        $this->memberOn($gold);

        $this->checkout($product, $channel)->assertCreated();

        $transaction = Transaction::firstOrFail();
        $this->assertSame($gold->id, $transaction->membership_plan_id);
        // The tier explains the figure rather than merely accompanying it.
        $this->assertSame(21000, (int) $transaction->amount_base);
    }

    public function test_a_plan_without_a_row_for_the_product_records_the_default_tier(): void
    {
        // A plan created after the last repricing run. The default tier is what
        // actually priced the order, so that is what must be recorded.
        $default = $this->plan('basic', isDefault: true);
        $hokage = $this->plan('hokage', sortOrder: 5);
        $product = $this->sellableProduct();
        ProductPlanPrice::create(['product_id' => $product->id, 'membership_plan_id' => $default->id, 'price' => 25000]);
        $channel = PaymentChannel::factory()->balance()->create();
        $this->memberOn($hokage);

        $this->checkout($product, $channel)->assertCreated();

        $this->assertSame($default->id, Transaction::firstOrFail()->membership_plan_id);
    }

    public function test_an_order_priced_without_any_plan_records_no_plan(): void
    {
        // No plan price exists at all, so `price_member` answered. Recording the
        // member's plan here would claim a list that was never consulted.
        $gold = $this->plan('gold');
        $product = $this->sellableProduct();
        $channel = PaymentChannel::factory()->balance()->create();
        $this->memberOn($gold);

        $this->checkout($product, $channel)->assertCreated();

        $this->assertNull(Transaction::firstOrFail()->membership_plan_id);
    }

    public function test_the_admin_reads_the_plan_name_and_an_absence_for_older_orders(): void
    {
        $gold = $this->plan('gold');
        $withPlan = Transaction::factory()->create(['membership_plan_id' => $gold->id]);
        $legacy = Transaction::factory()->create();

        $this->actingAsAdmin();

        $this->getJson("/api/v1/transactions/{$withPlan->id}")
            ->assertOk()
            ->assertJsonPath('data.membership_plan.code', 'gold')
            ->assertJsonPath('data.membership_plan.name', 'Gold');

        // Un-backfilled on purpose: the plan that priced an older order cannot be
        // recovered, so the admin is told nothing rather than something wrong.
        $this->getJson("/api/v1/transactions/{$legacy->id}")
            ->assertOk()
            ->assertJsonPath('data.membership_plan', null)
            ->assertJsonPath('data.membership_plan_id', null);

        $this->getJson('/api/v1/transactions')
            ->assertOk()
            ->assertJsonPath('data.data.0.membership_plan.code', 'gold');
    }

    public function test_a_retired_plan_still_explains_the_orders_it_priced(): void
    {
        // Soft-deleted, like a product: the figure it produced must stay
        // explainable after the plan is taken off the shelf.
        $gold = $this->plan('gold');
        $this->plan('basic', isDefault: true);
        $transaction = Transaction::factory()->create(['membership_plan_id' => $gold->id]);

        $gold->delete();

        $this->actingAsAdmin();

        $this->getJson("/api/v1/transactions/{$transaction->id}")
            ->assertOk()
            ->assertJsonPath('data.membership_plan.code', 'gold');
    }
}
