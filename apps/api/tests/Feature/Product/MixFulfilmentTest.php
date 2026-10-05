<?php

namespace Tests\Feature\Product;

use App\Actions\Uxiolabs\ProcessUxiolabsTransactionAction;
use App\Enums\TransactionStatus;
use App\Models\Category;
use App\Models\Payment;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Delivering a mix: ONE paid order, one supplier order per component.
 *
 * The supplier rejects a duplicate `idtrx`, so every component needs a reference
 * of its own — and that reference is what the callback resolves against. This
 * pins both halves: the fan-out, and the roll-up that turns several supplier
 * verdicts back into the single status the rest of the system reads.
 */
class MixFulfilmentTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    private Product $mix;

    private Product $five;

    private Product $ten;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.uxiolabs.api_key' => 'test-api-key',
            'services.uxiolabs.base_url' => 'https://api.uxiotopup.id',
            'services.uxiolabs.callback_url' => 'https://our.app/api/v1/uxiolabs/callback',
            'services.uxiolabs.callback_ips' => '127.0.0.1',
        ]);

        $category = Category::factory()->create([
            'order_form_fields' => [
                'customer_no_template' => '{user_id}|{zone_id}',
                'fields' => [
                    ['key' => 'user_id', 'label' => 'User ID', 'type' => 'number', 'required' => true],
                    ['key' => 'zone_id', 'label' => 'Zone ID', 'type' => 'number', 'required' => true],
                ],
            ],
        ]);

        $this->supplier = Supplier::factory()->create(['name' => 'Uxiolabs']);

        $this->five = Product::factory()->create(['category_id' => $category->id, 'code' => 'ML5', 'price_modal' => 10000]);
        $this->ten = Product::factory()->create(['category_id' => $category->id, 'code' => 'ML10', 'price_modal' => 5000]);

        foreach ([$this->five, $this->ten] as $component) {
            SupplierProduct::factory()->for($component)->for($this->supplier)->create([
                'buyer_sku_code' => $component->code,
                'is_active' => true,
            ]);
        }

        $this->mix = Product::factory()->create([
            'category_id' => $category->id,
            'code' => 'MIX-5+10',
            'status' => true,
            'price_modal' => 25000,
        ]);

        $this->mix->mixItems()->create(['component_product_id' => $this->five->id, 'quantity' => 1]);
        $this->mix->mixItems()->create(['component_product_id' => $this->ten->id, 'quantity' => 1]);
    }

    private function fakeOrder(string $status = 'pending'): void
    {
        Http::fake(['*/order' => Http::response([
            'status' => true,
            'msg' => 'Pesanan berhasil!',
            'data' => ['id' => 'UX-'.uniqid(), 'keterangan' => '', 'status' => $status],
        ])]);
    }

    private function transaction(array $overrides = []): Transaction
    {
        return Transaction::factory()->create(array_merge([
            'product_id' => $this->mix->id,
            'status' => TransactionStatus::PAID,
            'target_uid' => '983232342',
            'target_server' => '9923',
        ], $overrides));
    }

    public function test_one_paid_order_places_one_supplier_order_per_component(): void
    {
        $this->fakeOrder();
        $transaction = $this->transaction();

        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);

        $orders = $transaction->supplierOrders()->get();

        $this->assertCount(2, $orders, 'A mix of two products must place two supplier orders.');
        // The whole point: distinct references, or the supplier refuses the second.
        $this->assertCount(2, $orders->pluck('idtrx')->unique());
        $this->assertTrue($orders->every(fn ($order) => $order->supplier_trx_id !== null));

        // Both still in flight → the parent is PROCESSING, not COMPLETED.
        $this->assertSame(TransactionStatus::PROCESSING, $transaction->fresh()->status);
    }

    public function test_quantity_becomes_that_many_supplier_orders(): void
    {
        $this->fakeOrder();
        $this->mix->mixItems()->where('component_product_id', $this->ten->id)->update(['quantity' => 2]);

        $transaction = $this->transaction();
        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);

        $this->assertCount(3, $transaction->supplierOrders()->get());
    }

    /**
     * A mix built from a provider SKU is delivered by that SKU AND its
     * components, so the product's own mapping places an order too.
     */
    public function test_it_also_orders_the_products_own_sku_when_it_has_one(): void
    {
        $this->fakeOrder();

        SupplierProduct::factory()->for($this->mix)->for($this->supplier)->create([
            'buyer_sku_code' => 'MIX-OWN',
            'is_active' => true,
        ]);

        $transaction = $this->transaction();
        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);

        $orders = $transaction->supplierOrders()->get();

        // Own SKU + the two components.
        $this->assertCount(3, $orders);
        $this->assertTrue(
            $orders->contains(fn ($order) => (int) $order->product_id === (int) $this->mix->id),
            'The mix product itself must appear as an order.',
        );
        // Still distinct references, or the supplier refuses the second call.
        $this->assertCount(3, $orders->pluck('idtrx')->unique());
    }

    /**
     * The detail screen lists one row per part, so the payload has to carry the
     * supplier and the timestamps each row needs.
     */
    public function test_the_detail_payload_lists_each_sub_order_with_its_supplier(): void
    {
        $this->fakeOrder();
        $transaction = $this->transaction();
        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);

        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $this->getJson("/api/v1/transactions/{$transaction->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data.supplier_orders')
            ->assertJsonPath('data.supplier_orders.0.supplier_name', 'Uxiolabs')
            ->assertJsonPath('data.supplier_orders.0.product_code', 'ML5');
    }

    public function test_a_callback_settles_one_component_and_the_parent_follows(): void
    {
        $this->fakeOrder();
        $transaction = $this->transaction();
        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);

        $orders = $transaction->supplierOrders()->orderBy('id')->get();

        // First component delivered — the parent must NOT complete yet.
        $this->postJson('/api/v1/uxiolabs/callback', [
            'id' => 'UX-1',
            'idtrx' => $orders[0]->idtrx,
            'keterangan' => 'SN-A',
            'status' => 'success',
        ])->assertOk();

        $this->assertSame(TransactionStatus::PROCESSING, $transaction->fresh()->status);
        $this->assertSame('SN-A', $orders[0]->fresh()->sn);

        // Second delivered — now the order is complete.
        $this->postJson('/api/v1/uxiolabs/callback', [
            'id' => 'UX-2',
            'idtrx' => $orders[1]->idtrx,
            'keterangan' => 'SN-B',
            'status' => 'success',
        ])->assertOk();

        $fresh = $transaction->fresh();
        $this->assertSame(TransactionStatus::COMPLETED, $fresh->status);
        // Both serial numbers, so the customer's receipt is not half-blind.
        $this->assertStringContainsString('SN-A', (string) $fresh->sn);
        $this->assertStringContainsString('SN-B', (string) $fresh->sn);
    }

    /**
     * One component failing means the customer cannot use what they bought, so
     * the whole order is refunded — the agreed all-or-nothing rule.
     */
    public function test_one_failed_component_fails_the_whole_order_and_refunds_it(): void
    {
        $this->fakeOrder();

        $role = Role::factory()->create();
        $user = User::factory()->create(['role_id' => $role->id, 'balance' => 0]);
        $channel = PaymentChannel::factory()->balance()->create();

        $transaction = $this->transaction([
            'user_id' => $user->id,
            'payment_channel_id' => $channel->id,
        ]);
        Payment::factory()->create([
            'transaction_id' => $transaction->id,
            'payment_channel_id' => $channel->id,
        ]);

        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);
        $orders = $transaction->supplierOrders()->orderBy('id')->get();

        $this->postJson('/api/v1/uxiolabs/callback', [
            'id' => 'UX-1',
            'idtrx' => $orders[0]->idtrx,
            'keterangan' => '',
            'status' => 'success',
        ])->assertOk();

        $this->postJson('/api/v1/uxiolabs/callback', [
            'id' => 'UX-2',
            'idtrx' => $orders[1]->idtrx,
            'keterangan' => '',
            'status' => 'cancel',
        ])->assertOk();

        $this->assertSame(TransactionStatus::FAILED_PROVIDER, $transaction->fresh()->status);
    }
}
