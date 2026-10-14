<?php

namespace Tests\Feature\Storefront;

use App\Enums\PaymentStatus;
use App\Enums\TransactionStatus;
use App\Jobs\ProcessUxiolabsTopup;
use App\Models\Category;
use App\Models\Payment;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Role;
use App\Models\Setting;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StorefrontOrderTest extends TestCase
{
    use RefreshDatabase;

    private function order(array $attributes = [], array $paymentAttributes = []): Transaction
    {
        $channel = PaymentChannel::factory()->create(['payment_type' => 'qris', 'channel_code' => 'qris']);

        $transaction = Transaction::factory()->create(array_merge([
            'invoice_number' => 'INV-20260731-ABC123',
            'payment_channel_id' => $channel->id,
            'guest_contact' => '628123456789',
            'target_uid' => '337850017',
            'target_server' => '9423',
            'target_nickname' => 'Ramonezz',
            'amount_base' => 25000,
            'amount_fee' => 1000,
            'amount_total' => 26000,
            'margin' => 6000,
            'status' => TransactionStatus::PENDING,
        ], $attributes));

        Payment::factory()->create(array_merge([
            'transaction_id' => $transaction->id,
            'payment_channel_id' => $channel->id,
            'gross_amount' => 26000,
            'admin_fee' => 1000,
            'status' => PaymentStatus::PENDING,
            'payment_data' => ['qr_string' => '000201010212...'],
        ], $paymentAttributes));

        return $transaction;
    }

    public function test_invoice_returns_the_persisted_payment_instructions(): void
    {
        $this->order();

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.status', 'PENDING')
            ->assertJsonPath('data.payment.instructions.qr_string', '000201010212...')
            ->assertJsonPath('data.target.nickname', 'Ramonezz');
    }

    public function test_invoice_exposes_an_expiry_so_the_countdown_matches_the_reaper(): void
    {
        $this->order();

        $expiresAt = $this->getJson('/api/v1/invoices/INV-20260731-ABC123')->json('data.expires_at');

        // 900s window + 300s grace for qris — the same constant payments:sync-expired uses.
        $this->assertNotNull($expiresAt);
        $this->assertEqualsWithDelta(1200, now()->diffInSeconds($expiresAt, absolute: true), 5);
    }

    public function test_invoice_never_leaks_contact_margin_or_supplier_data(): void
    {
        $this->order();

        $response = $this->getJson('/api/v1/invoices/INV-20260731-ABC123')->assertOk();

        // Unauthenticated endpoint: anyone with the invoice number can read it.
        $response->assertJsonMissing(['guest_contact' => '628123456789']);
        $response->assertJsonMissing(['margin' => 6000]);
        $this->assertStringNotContainsString('supplier_id', $response->getContent());
    }

    public function test_invoice_marks_terminal_statuses_so_polling_can_stop(): void
    {
        $this->order(['status' => TransactionStatus::COMPLETED]);

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.is_terminal', true);
    }

    public function test_unknown_invoice_returns_not_found(): void
    {
        $this->getJson('/api/v1/invoices/INV-NOPE')->assertNotFound();
    }

    public function test_track_order_finds_an_order_by_invoice_number(): void
    {
        $this->order();

        $this->getJson('/api/v1/orders/track?query=INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.invoice_number', 'INV-20260731-ABC123');
    }

    public function test_track_order_finds_an_order_by_whatsapp_number(): void
    {
        $this->order();

        // Stored as "628…"; the customer types the national "08…" form.
        $this->getJson('/api/v1/orders/track?query=08123456789')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_track_order_does_not_match_a_partial_phone_number(): void
    {
        $this->order();

        // A prefix search would let the table be walked digit by digit.
        $this->getJson('/api/v1/orders/track?query=62812345')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_track_order_finds_an_order_by_email(): void
    {
        $this->order(['contact_email' => 'guest@example.com']);

        // Case-insensitive exact match on the checkout email.
        $this->getJson('/api/v1/orders/track?query=GUEST@example.com')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.invoice_number', 'INV-20260731-ABC123');
    }

    public function test_track_order_finds_a_member_order_by_account_email(): void
    {
        $role = Role::factory()->create(['name' => 'Member']);
        $user = User::factory()->create(['role_id' => $role->id, 'email' => 'member@example.com']);
        $this->order(['user_id' => $user->id, 'guest_contact' => null, 'contact_email' => null]);

        $this->getJson('/api/v1/orders/track?query=member@example.com')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_validate_id_degrades_gracefully_when_no_provider_is_configured(): void
    {
        $game = Category::factory()->create(['slug' => 'mobile-legends', 'validasi_nickname' => null]);

        // Must be 200, not an error: a game with no lookup provider still has to
        // be purchasable, so the client sees "no nickname", not a broken form.
        $this->postJson('/api/v1/games/mobile-legends/validate-id', ['target_uid' => '337850017'])
            ->assertOk()
            ->assertJsonPath('data.nickname', null)
            ->assertJsonPath('data.supported', false);

        $this->assertNotNull($game->fresh());
    }

    public function test_validate_id_stays_unsupported_while_the_feature_is_off(): void
    {
        Category::factory()->create([
            'slug' => 'mobile-legends',
            'validasi_nickname' => 'https://provider.test/check?id={user_id}&zone={server_id}',
        ]);

        Http::fake(['provider.test/*' => Http::response(['data' => ['nickname' => 'Ramonezz']])]);

        // The lookup is switched off platform-wide for now: the endpoint answers
        // "no nickname available" and never reaches the provider.
        $this->postJson('/api/v1/games/mobile-legends/validate-id', [
            'target_uid' => '337850017',
            'target_server' => '9423',
        ])
            ->assertOk()
            ->assertJsonPath('data.nickname', null)
            ->assertJsonPath('data.validated', false)
            ->assertJsonPath('data.supported', false);

        Http::assertNothingSent();
    }

    public function test_validate_id_survives_a_provider_outage(): void
    {
        Category::factory()->create([
            'slug' => 'mobile-legends',
            'validasi_nickname' => 'https://provider.test/check?id={user_id}',
        ]);

        Http::fake(['provider.test/*' => Http::response('', 500)]);

        // A dead provider must never block a purchase.
        $this->postJson('/api/v1/games/mobile-legends/validate-id', ['target_uid' => '337850017'])
            ->assertOk()
            ->assertJsonPath('data.nickname', null);
    }

    /**
     * uxiolabs has no cek-username endpoint, so the legacy supplier-backed
     * providers (`digiflazz:{sku}` / `product:{id}`) resolve to "unsupported"
     * — nickname null, HTTP 200, no supplier call. A stale prod value must
     * degrade exactly like an unconfigured game, never error.
     */
    public function test_validate_id_treats_legacy_supplier_providers_as_unsupported(): void
    {
        Category::factory()->create(['slug' => 'free-fire', 'validasi_nickname' => 'digiflazz:ffusername']);

        $product = Product::factory()->create();
        SupplierProduct::factory()->for($product)->create(['buyer_sku_code' => 'ffusername', 'is_active' => true]);
        Category::factory()->create(['slug' => 'other-game', 'validasi_nickname' => 'product:'.$product->id]);

        Http::fake();

        $this->postJson('/api/v1/games/free-fire/validate-id', ['target_uid' => '337850017'])
            ->assertOk()
            ->assertJsonPath('data.nickname', null)
            ->assertJsonPath('data.supported', false);

        $this->postJson('/api/v1/games/other-game/validate-id', ['target_uid' => '337850017'])
            ->assertOk()
            ->assertJsonPath('data.nickname', null)
            ->assertJsonPath('data.supported', false);

        Http::assertNothingSent();
    }

    public function test_game_detail_offers_no_username_check_while_the_feature_is_off(): void
    {
        Category::factory()->create(['slug' => 'free-fire', 'status' => true, 'validasi_nickname' => 'https://api.example.com/validate/ff']);
        Category::factory()->create(['slug' => 'plain-game', 'status' => true, 'validasi_nickname' => null]);
        Category::factory()->create([
            'slug' => 'disabled-game',
            'status' => true,
            'validasi_nickname' => 'https://api.example.com/validate/ff',
            'nickname_check_enabled' => false,
        ]);

        // The check is switched off platform-wide for now, so even the game with
        // a provider configured AND the master toggle on is offered nothing.
        $this->getJson('/api/v1/games/free-fire')->assertOk()->assertJsonPath('data.supports_nickname_check', false);
        $this->getJson('/api/v1/games/plain-game')->assertOk()->assertJsonPath('data.supports_nickname_check', false);
        $this->getJson('/api/v1/games/disabled-game')->assertOk()->assertJsonPath('data.supports_nickname_check', false);
    }

    public function test_checkout_recognises_a_member_from_their_bearer_token(): void
    {
        config(['services.uxiolabs.api_key' => 'test-api-key']);
        Http::fake(['*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']])]);

        $product = Product::factory()->create(['status' => true, 'price_member' => 25000]);
        SupplierProduct::factory()->for($product)->create(['is_active' => true, 'price' => 19000]);
        $channel = PaymentChannel::factory()->balance()->create();

        $role = Role::factory()->create(['name' => 'Member']);
        $user = User::factory()->create(['role_id' => $role->id, 'balance' => 100000]);
        $token = $user->createToken('access_token')->plainTextToken;

        // Deliberately NOT Sanctum::actingAs: that sets the default guard and
        // would hide the bug this covers. /v1/checkout is a public route with
        // no auth middleware, so `$request->user()` consults the `web` guard and
        // never sees the token — the member would be booked as a guest, told to
        // supply a WhatsApp number, and locked out of paying from their balance.
        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/checkout', [
                'product_id' => $product->id,
                'payment_channel_id' => $channel->id,
                'target_uid' => '337850017',
                'email' => 'buyer@example.com',
            ]);

        $response->assertCreated();

        $this->assertDatabaseHas('transactions', [
            'user_id' => $user->id,
            'guest_contact' => null,
        ]);
        $this->assertSame(100000 - 25000, $user->fresh()->balance);
    }

    public function test_checkout_stores_the_confirmed_nickname(): void
    {
        config(['services.uxiolabs.api_key' => 'test-api-key']);
        Http::fake(['*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'pending', 'id' => 'UX1']])]);

        $game = Category::factory()->create();
        $product = Product::factory()->create(['category_id' => $game->id, 'status' => true, 'price_member' => 25000]);
        SupplierProduct::factory()->for($product)->create(['is_active' => true, 'price' => 19000]);
        $channel = PaymentChannel::factory()->balance()->create();

        $role = Role::factory()->create(['name' => 'Member']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id, 'balance' => 100000]), ['access-api']);

        $this->postJson('/api/v1/checkout', [
            'product_id' => $product->id,
            'payment_channel_id' => $channel->id,
            'target_uid' => '337850017',
            'target_server' => '9423',
            'target_nickname' => 'Ramonezz',
            'email' => 'buyer@example.com',
        ])->assertCreated();

        // Display-only: frozen so the receipt keeps showing the name the
        // customer confirmed, even if the player renames the account later.
        $this->assertDatabaseHas('transactions', [
            'target_uid' => '337850017',
            'target_nickname' => 'Ramonezz',
        ]);
    }

    private function member(): User
    {
        $role = Role::factory()->create(['name' => 'Member']);

        return User::factory()->create(['role_id' => $role->id]);
    }

    public function test_an_open_member_order_projects_the_points_it_will_earn(): void
    {
        Setting::create([
            'group' => 'points', 'key' => 'earn_percent', 'value' => '2',
            'type' => 'number', 'label' => 'Earn %', 'is_public' => true,
        ]);
        $this->order(['user_id' => $this->member()->id, 'amount_base' => 25000]);

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.points.earned', 500)
            ->assertJsonPath('data.points.is_estimate', true)
            ->assertJsonPath('data.points.eligible', true);
    }

    /**
     * The product's own rule must win over the global setting. This is the case
     * that catches the eager-load trap: `point_percent` is not selected by
     * default, strict mode is off, and a missing column reads back as null —
     * which would silently quote the global 2% instead of this product's 5%.
     */
    public function test_the_projection_honours_the_products_own_earning_rule(): void
    {
        Setting::create([
            'group' => 'points', 'key' => 'earn_percent', 'value' => '2',
            'type' => 'number', 'label' => 'Earn %', 'is_public' => true,
        ]);
        $product = Product::factory()->create(['point_percent' => 5, 'point_flat' => 0]);
        $this->order([
            'user_id' => $this->member()->id,
            'product_id' => $product->id,
            'amount_base' => 25000,
        ]);

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.points.earned', 1250);
    }

    public function test_a_completed_order_reports_the_points_actually_granted(): void
    {
        $this->order([
            'user_id' => $this->member()->id,
            'status' => TransactionStatus::COMPLETED,
            'points_earned' => 700,
        ]);

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.points.earned', 700)
            ->assertJsonPath('data.points.is_estimate', false);
    }

    public function test_a_guest_order_is_never_promised_points(): void
    {
        Setting::create([
            'group' => 'points', 'key' => 'earn_percent', 'value' => '2',
            'type' => 'number', 'label' => 'Earn %', 'is_public' => true,
        ]);
        $this->order(['user_id' => null]);

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.points.eligible', false)
            ->assertJsonPath('data.points.earned', 0);
    }

    public function test_a_failed_order_shows_no_projection(): void
    {
        Setting::create([
            'group' => 'points', 'key' => 'earn_percent', 'value' => '2',
            'type' => 'number', 'label' => 'Earn %', 'is_public' => true,
        ]);
        $this->order([
            'user_id' => $this->member()->id,
            'status' => TransactionStatus::EXPIRED,
        ]);

        $this->getJson('/api/v1/invoices/INV-20260731-ABC123')
            ->assertOk()
            ->assertJsonPath('data.points.earned', 0)
            ->assertJsonPath('data.points.is_estimate', false);
    }

    /**
     * A recovered payment is a sale that really happened, so it settles like any
     * other. Marking it PAID and fulfilling the order without booking the split
     * would leave the merchant unpaid for it and kita's markup unrecorded.
     */
    public function test_the_checkout_sweep_settles_the_split_for_a_payment_it_recovers(): void
    {
        Bus::fake([ProcessUxiolabsTopup::class]);

        $merchant = $this->member();

        // The frozen figures the split reads: 1000 admin fee, minus the
        // gateway's 300 and the 100 tax on the fee, leaves kita 600.
        $transaction = $this->order(
            ['merchant_id' => $merchant->id],
            ['gross_amount' => 26000, 'admin_fee' => 1000, 'gateway_fee' => 300, 'tax_amount' => 100],
        );

        // Past the qris window (900s + 300s grace) so the sweep picks it up.
        Payment::whereKey($transaction->payment->id)->update(['created_at' => now()->subHours(2)]);

        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['code' => 0, 'data' => ['status' => 'success']])]);

        $this->artisan('payments:sync-expired')->assertSuccessful();

        $this->assertSame(PaymentStatus::SUCCESS, $transaction->payment->fresh()->status);
        $this->assertSame(TransactionStatus::PAID, $transaction->fresh()->status);

        // The merchant is credited their net sale price...
        $this->assertDatabaseHas('balance_mutations', [
            'user_id' => $merchant->id,
            'type' => 'settlement',
            'reference' => $transaction->invoice_number,
            'amount' => 25000,
        ]);

        // ...and kita books the admin fee net of the gateway cut and the tax.
        $this->assertDatabaseHas('platform_mutations', [
            'type' => 'markup',
            'reference' => $transaction->invoice_number,
            'amount' => 600,
        ]);

        Bus::assertDispatched(ProcessUxiolabsTopup::class);
    }
}
