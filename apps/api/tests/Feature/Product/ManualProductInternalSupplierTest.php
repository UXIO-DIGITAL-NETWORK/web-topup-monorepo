<?php

namespace Tests\Feature\Product;

use App\Actions\Uxiolabs\ProcessUxiolabsTransactionAction;
use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use App\Support\Storefront\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A product typed in by hand has no provider behind it.
 *
 * Two things have to hold, and both are silent when they break: the product
 * must be sellable at all (which requires an ACTIVE supplier mapping), and
 * payment must NOT fire an order at Uxiotopup under a SKU that does not exist
 * there.
 */
class ManualProductInternalSupplierTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.uxiolabs.api_key' => 'test-api-key',
            'services.uxiolabs.base_url' => 'https://api.uxiotopup.id',
        ]);

        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $this->category = Category::factory()->create();
    }

    private function createManualProduct(): Product
    {
        $this->postJson('/api/v1/products', [
            'category_id' => $this->category->id,
            'name' => 'Produk Manual 100 Diamond',
            'code' => 'MANUAL-100',
            'price_modal' => 50000,
            'price_member' => 60000,
            'price_vip' => 60000,
            'price_reseller' => 60000,
            'price_agent' => 60000,
            'status' => false,
        ])->assertCreated();

        $product = Product::where('code', 'MANUAL-100')->firstOrFail();

        return $product;
    }

    public function test_a_manual_product_is_mapped_to_the_internal_supplier(): void
    {
        $product = $this->createManualProduct();

        $mapping = SupplierProduct::where('product_id', $product->id)->first();

        $this->assertNotNull($mapping, 'Without a mapping the storefront can never serve this product.');
        $this->assertTrue((bool) $mapping->supplier->is_system);
        $this->assertTrue((bool) $mapping->is_active);
        // The margin guard reads the cost from the mapping, so it must mirror
        // what the admin typed as modal.
        $this->assertSame(50000, (int) $mapping->price);
    }

    public function test_a_manual_product_can_be_published_and_served(): void
    {
        $product = $this->createManualProduct();

        $this->postJson("/api/v1/products/{$product->id}/publish")->assertOk();

        $this->assertSame(1, Catalog::sellableProducts(
            Product::query()->whereKey($product->id)
        )->count());
    }

    /**
     * The bug this guards against: the fulfilment action resolves ONE global
     * supplier driver, so without the `is_system` branch a manual product is
     * ordered at Uxiotopup with a code it does not know.
     */
    public function test_fulfilment_does_not_call_the_supplier_for_a_manual_product(): void
    {
        $product = $this->createManualProduct();
        $mapping = SupplierProduct::where('product_id', $product->id)->firstOrFail();

        $transaction = Transaction::factory()->create([
            'product_id' => $product->id,
            'supplier_id' => $mapping->supplier_id,
            'status' => TransactionStatus::PAID,
            'target_uid' => '983232342',
        ]);

        Http::fake();

        app(ProcessUxiolabsTransactionAction::class)->execute($transaction);

        Http::assertNothingSent();

        $fresh = $transaction->fresh();
        $this->assertSame(TransactionStatus::PAID, $fresh->status);
        $this->assertSame(ProviderStatus::QUEUED, $fresh->provider_status);
    }

    public function test_editing_a_manual_product_keeps_the_cost_in_step(): void
    {
        $product = $this->createManualProduct();

        $this->postJson("/api/v1/products/{$product->id}", [
            '_method' => 'PUT',
            'category_id' => $this->category->id,
            'name' => 'Produk Manual 100 Diamond',
            'code' => 'MANUAL-100',
            'price_modal' => 55000,
            'price_member' => 65000,
            'price_vip' => 65000,
            'price_reseller' => 65000,
            'price_agent' => 65000,
            'status' => false,
        ])->assertOk();

        $mapping = SupplierProduct::where('product_id', $product->id)->firstOrFail();
        $this->assertSame(55000, (int) $mapping->price);
    }

    /**
     * A provider-mapped product must not pick up an Internal System mapping just
     * because it was edited.
     */
    public function test_editing_a_provider_product_does_not_attach_the_internal_supplier(): void
    {
        $product = Product::factory()->create([
            'category_id' => $this->category->id,
            'code' => 'ML5',
        ]);
        SupplierProduct::factory()->for($product)
            ->for(Supplier::factory()->create(['name' => 'Uxiolabs']))
            ->create(['buyer_sku_code' => 'ML5', 'is_active' => true]);

        $this->postJson("/api/v1/products/{$product->id}", [
            '_method' => 'PUT',
            'category_id' => $this->category->id,
            'name' => $product->name,
            'code' => 'ML5',
            'price_modal' => $product->price_modal,
            'price_member' => $product->price_member,
            'price_vip' => $product->price_vip,
            'price_reseller' => $product->price_reseller,
            'price_agent' => $product->price_agent,
            'status' => true,
        ])->assertOk();

        $this->assertSame(1, SupplierProduct::where('product_id', $product->id)->count());
    }
}
