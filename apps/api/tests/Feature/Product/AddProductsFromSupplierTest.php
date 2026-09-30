<?php

namespace Tests\Feature\Product;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierCategory;
use App\Models\SupplierProduct;
use App\Models\User;
use App\Support\Storefront\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Add Products ▸ From Supplier — the pool's replacement.
 *
 * Whatever the admin picks in a provider category must appear on the products
 * page immediately, as a DRAFT: visible to the admin, invisible to the
 * storefront until it is published deliberately.
 */
class AddProductsFromSupplierTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.uxiolabs.api_key' => 'test-api-key']);

        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $this->supplier = Supplier::factory()->create(['name' => 'Uxiolabs']);
        $this->category = Category::factory()->create(['code' => 'mlbb']);

        SupplierCategory::create([
            'supplier_id' => $this->supplier->id,
            'category_id' => $this->category->id,
            'provider_category' => 'Mobile Legends',
        ]);
    }

    private function fakePriceList(array $items): void
    {
        Http::fake(['*/service' => Http::response([
            'status' => true,
            'msg' => 'Berhasil Mendapatkan Data Layanan',
            'data' => $items,
        ])]);
    }

    private function serviceItem(array $overrides = []): array
    {
        return array_merge([
            'id' => 'ML5',
            'nama_layanan' => 'Mobile Legends 5 Diamond',
            'kategori' => 'Mobile Legends',
            'harga' => 10000,
            'status' => 'aktif',
        ], $overrides);
    }

    public function test_a_provider_sku_becomes_a_draft_product_immediately(): void
    {
        $this->fakePriceList([$this->serviceItem()]);

        $this->postJson('/api/v1/products/from-supplier', ['buyer_sku_codes' => ['ML5']])
            ->assertCreated()
            ->assertJsonPath('data.created', 1);

        $product = Product::where('code', 'ML5')->first();
        $this->assertNotNull($product, 'The SKU must land as a product, not a pooled row.');
        $this->assertFalse((bool) $product->status);
        $this->assertNull($product->published_at);

        $mapping = SupplierProduct::where('buyer_sku_code', 'ML5')->first();
        $this->assertSame($product->id, $mapping->product_id);
        $this->assertFalse((bool) $mapping->is_active);

        // Draft means draft: the storefront cannot see it yet.
        $this->assertSame(0, Catalog::sellableProducts(
            Product::query()->whereKey($product->id)
        )->count());
    }

    public function test_an_unknown_sku_is_skipped_with_a_reason(): void
    {
        $this->fakePriceList([$this->serviceItem()]);

        $this->postJson('/api/v1/products/from-supplier', ['buyer_sku_codes' => ['NOPE']])
            ->assertCreated()
            ->assertJsonPath('data.created', 0)
            ->assertJsonPath('data.skipped.0.buyer_sku_code', 'NOPE');

        $this->assertSame(0, Product::count());
    }

    public function test_a_sku_whose_category_is_not_mapped_is_skipped(): void
    {
        $this->fakePriceList([$this->serviceItem(['kategori' => 'Free Fire'])]);

        $this->postJson('/api/v1/products/from-supplier', ['buyer_sku_codes' => ['ML5']])
            ->assertCreated()
            ->assertJsonPath('data.created', 0)
            ->assertJsonPath('data.skipped.0.buyer_sku_code', 'ML5');

        $this->assertSame(0, Product::count());
    }

    /**
     * One bad SKU in a batch of many must not lose the good ones — the same
     * promise the pool action made.
     */
    public function test_a_batch_keeps_the_good_rows(): void
    {
        $this->fakePriceList([
            $this->serviceItem(),
            $this->serviceItem(['id' => 'ML10', 'nama_layanan' => 'Mobile Legends 10 Diamond']),
        ]);

        $this->postJson('/api/v1/products/from-supplier', ['buyer_sku_codes' => ['ML5', 'NOPE', 'ML10']])
            ->assertCreated()
            ->assertJsonPath('data.created', 2);

        $this->assertSame(2, Product::count());
    }

    public function test_it_requires_authentication(): void
    {
        $this->app['auth']->forgetGuards();

        $this->postJson('/api/v1/products/from-supplier', ['buyer_sku_codes' => ['ML5']])
            ->assertUnauthorized();
    }
}
