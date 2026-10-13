<?php

namespace Tests\Feature\Checkout;

use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Role;
use App\Models\SupplierProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CheckoutTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;

    private PaymentChannel $balanceChannel;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.uxiolabs.api_key' => 'test-api-key']);

        $this->product = Product::factory()->create([
            'price_member' => 12000,
        ]);
        SupplierProduct::factory()->for($this->product)->create(['price' => 10000]);
        $this->balanceChannel = PaymentChannel::factory()->balance()->create();
    }

    private function actingAsMember(int $balance = 100000): User
    {
        $role = Role::factory()->create(['name' => 'Member']);
        $user = User::factory()->create(['role_id' => $role->id, 'balance' => $balance]);
        Sanctum::actingAs($user, ['access-api']);

        return $user;
    }

    public function test_balance_checkout_deducts_balance_and_processes_topup(): void
    {
        Http::fake([
            '*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']]),
        ]);

        $user = $this->actingAsMember();

        $response = $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ]);

        $response->assertCreated()
            // Enum casts must serialize to the same raw values in API output.
            ->assertJsonPath('data.payment.status', 'PROCESSING');
        $this->assertSame(100000 - 12000, $user->fresh()->balance);
        $this->assertDatabaseHas('transactions', [
            'product_id' => $this->product->id,
            'user_id' => $user->id,
            'status' => 'PROCESSING',
            'margin' => 2000,
        ]);
        $this->assertDatabaseHas('payments', ['status' => '3']);
    }

    public function test_checkout_freezes_the_products_identity_on_the_order(): void
    {
        Http::fake([
            '*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']]),
        ]);

        $this->product->update(['name' => 'Mobile Legends 100 Diamond', 'code' => 'MLBB_100']);
        $this->actingAsMember();

        $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ])->assertCreated();

        // Frozen at checkout so a later rename cannot rewrite what sold.
        $this->assertDatabaseHas('transactions', [
            'product_id' => $this->product->id,
            'product_name' => 'Mobile Legends 100 Diamond',
            'product_code' => 'MLBB_100',
        ]);
    }

    public function test_checkout_rejected_when_margin_is_negative(): void
    {
        $this->product->supplierProducts()->update(['price' => 15000]);
        $this->actingAsMember();

        $response = $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ]);

        $response->assertStatus(400);
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_checkout_rejected_for_inactive_product(): void
    {
        $this->product->update(['status' => false]);
        $this->actingAsMember();

        $response = $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ]);

        $response->assertStatus(400)
            ->assertJsonPath('message', 'Produk sedang tidak tersedia.');
    }

    public function test_checkout_rejected_for_disallowed_payment_type(): void
    {
        // Active row, but not one of the offered categories (VA / e-wallet / QRIS).
        $channel = PaymentChannel::factory()->create([
            'channel_code' => 'alfamart',
            'payment_type' => 'convenience_store',
            'is_active' => true,
        ]);
        $this->actingAsMember();

        $response = $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $channel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ]);

        $response->assertStatus(400)
            ->assertJsonPath('message', 'Metode pembayaran ini tidak tersedia. Silakan pilih VA, E-Wallet, atau QRIS.');
        $this->assertDatabaseCount('transactions', 0);
    }

    public function test_duplicate_submit_within_window_is_rejected(): void
    {
        Http::fake([
            '*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']]),
        ]);

        $this->actingAsMember();

        $payload = [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ];

        $this->postJson('/api/v1/checkout', $payload)->assertCreated();

        $this->postJson('/api/v1/checkout', $payload)
            ->assertStatus(400)
            ->assertJsonPath('message', 'Permintaan duplikat terdeteksi. Mohon tunggu beberapa detik sebelum mencoba lagi.');

        $this->assertDatabaseCount('transactions', 1);
    }

    public function test_failed_checkout_releases_dedupe_key_for_retry(): void
    {
        Http::fake([
            '*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']]),
        ]);

        $user = $this->actingAsMember(balance: 1000); // insufficient

        $payload = [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
        ];

        $this->postJson('/api/v1/checkout', $payload)->assertStatus(400);

        $user->update(['balance' => 100000]);

        $this->postJson('/api/v1/checkout', $payload)->assertCreated();
    }

    public function test_checkout_endpoint_is_throttled(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/checkout', []);
        }

        $this->postJson('/api/v1/checkout', [])->assertStatus(429);
    }

    public function test_checkout_requires_an_email(): void
    {
        $this->actingAsMember();

        $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            // no email
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_checkout_stores_contact_email_and_locale(): void
    {
        Http::fake(['*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']])]);
        $this->actingAsMember();

        $this->postJson('/api/v1/checkout', [
            'product_id' => $this->product->id,
            'payment_channel_id' => $this->balanceChannel->id,
            'target_uid' => '12345678',
            'email' => 'Buyer@Example.com',
            'locale' => 'en',
        ])->assertCreated();

        $this->assertDatabaseHas('transactions', [
            'product_id' => $this->product->id,
            'contact_email' => 'Buyer@Example.com',
            'locale' => 'en',
        ]);
    }
}
