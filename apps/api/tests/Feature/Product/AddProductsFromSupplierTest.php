<?php

namespace Tests\Feature\Product;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\SubCategory;
use App\Models\Supplier;
use App\Models\SupplierCategory;
use App\Models\SupplierProduct;
use App\Models\User;
use App\Support\Storefront\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
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

    /**
     * The modal's shape: one entry per product, carrying everything the admin
     * typed, so the product is finished here rather than on another screen.
     */
    public function test_it_applies_the_data_typed_in_the_modal(): void
    {
        $this->fakePriceList([$this->serviceItem()]);

        $this->postJson('/api/v1/products/from-supplier', [
            'items' => [[
                'buyer_sku_code' => 'ML5',
                'name' => 'Diamond 5 Spesial',
                'code' => 'ML5-SPESIAL',
                'discount_type' => 'percent',
                'discount_value' => 10,
                'point_percent' => 2,
                'point_flat' => 50,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.created', 1);

        $product = Product::where('code', 'ML5-SPESIAL')->firstOrFail();

        $this->assertSame('Diamond 5 Spesial', $product->name);
        $this->assertSame('percent', $product->discount_type);
        $this->assertSame(10, (int) $product->discount_value);
        $this->assertSame(2.0, (float) $product->point_percent);
        $this->assertSame(50, (int) $product->point_flat);
        // Still a draft: nothing said "publish".
        $this->assertFalse((bool) $product->status);
    }

    public function test_it_publishes_straight_away_when_asked(): void
    {
        $this->fakePriceList([$this->serviceItem()]);

        $this->postJson('/api/v1/products/from-supplier', [
            'items' => [[
                'buyer_sku_code' => 'ML5',
                'publish' => true,
            ]],
        ])
            ->assertCreated()
            ->assertJsonPath('data.created', 1)
            ->assertJsonPath('data.published', 1);

        $product = Product::where('code', 'ML5')->firstOrFail();
        $this->assertTrue((bool) $product->status);
        $this->assertSame(1, Catalog::sellableProducts(Product::query()->whereKey($product->id))->count());
    }

    /**
     * A mix is built from products that already exist, which is the one case the
     * "cannot pick a SKU twice" rule deliberately allows.
     */
    public function test_it_can_use_an_existing_product_as_a_mix_component(): void
    {
        $this->fakePriceList([
            $this->serviceItem(),
            $this->serviceItem(['id' => 'ML10', 'nama_layanan' => 'Mobile Legends 10 Diamond']),
        ]);

        // Created first, so it is "already ours" by the time the mix is built.
        $this->postJson('/api/v1/products/from-supplier', [
            'items' => [['buyer_sku_code' => 'ML5', 'price_min' => null]],
        ])->assertCreated();

        $component = Product::where('code', 'ML5')->firstOrFail();
        $component->update(['price_modal' => 10000]);

        $this->postJson('/api/v1/products/from-supplier', [
            'items' => [[
                'buyer_sku_code' => 'ML10',
                'name' => 'Paket 5 + 10',
                'code' => 'MIX-5-10',
                'mix_items' => [['product_id' => $component->id, 'quantity' => 2]],
            ]],
        ])->assertCreated();

        $mix = Product::where('code', 'MIX-5-10')->firstOrFail();

        $this->assertTrue($mix->isMix());
        // The SKU the mix was made from still ships, so its cost counts too:
        // own ML10 (10.000) + 2 × component ML5 (10.000) = 30.000.
        $this->assertSame(30000, (int) $mix->price_modal);
    }

    public function test_it_stores_a_logo_uploaded_with_the_row(): void
    {
        $this->fakePriceList([$this->serviceItem()]);
        Storage::fake('public');

        $this->post('/api/v1/products/from-supplier', [
            'items' => [[
                'buyer_sku_code' => 'ML5',
                'name' => 'Lima',
                // Multipart: the logo travels as a file with the rest of the row.
                'logo' => UploadedFile::fake()->image('logo.png', 128, 128),
            ]],
        ])->assertCreated();

        $product = Product::where('code', 'ML5')->firstOrFail();

        $this->assertNotNull($product->logo);
        Storage::disk('public')->assertExists($product->logo);
    }

    public function test_it_files_the_product_under_the_chosen_sub_category(): void
    {
        $this->fakePriceList([$this->serviceItem()]);

        $subCategory = SubCategory::factory()->create(['category_id' => $this->category->id]);

        $this->postJson('/api/v1/products/from-supplier', [
            'items' => [[
                'buyer_sku_code' => 'ML5',
                'name' => 'Lima',
                'sub_name' => 'Spesial',
                'sub_category_id' => $subCategory->id,
            ]],
        ])->assertCreated();

        $product = Product::where('code', 'ML5')->firstOrFail();

        $this->assertSame($subCategory->id, $product->sub_category_id);
        $this->assertSame('Spesial', $product->sub_name);
    }

    public function test_a_bad_entry_does_not_lose_the_good_ones_in_the_rich_shape(): void
    {
        $this->fakePriceList([
            $this->serviceItem(),
            $this->serviceItem(['id' => 'ML10', 'nama_layanan' => 'Mobile Legends 10 Diamond']),
        ]);

        $this->postJson('/api/v1/products/from-supplier', [
            'items' => [
                ['buyer_sku_code' => 'ML5', 'name' => 'Lima'],
                ['buyer_sku_code' => 'NOPE'],
                ['buyer_sku_code' => 'ML10', 'name' => 'Sepuluh'],
            ],
        ])
            ->assertCreated()
            ->assertJsonPath('data.created', 2)
            ->assertJsonPath('data.skipped.0.buyer_sku_code', 'NOPE');

        $this->assertSame(2, Product::count());
    }
}
