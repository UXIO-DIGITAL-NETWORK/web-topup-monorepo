<?php

namespace Tests\Feature\Product;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Models\User;
use App\Support\Storefront\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Listis / Unlistis — the only two lifecycle verbs the products page has.
 *
 * There is no delete: taking a product off the storefront must leave the row
 * behind, because order history resolves against `transactions.product_id`
 * (a RESTRICT foreign key) and "we sold this" has to keep being answerable.
 */
class PublishUnpublishProductTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
        $this->supplier = Supplier::factory()->create(['name' => 'Uxiolabs']);
    }

    private function draftProduct(array $mapping = []): Product
    {
        $product = Product::factory()->create([
            'category_id' => Category::factory()->create()->id,
            'status' => false,
            'published_at' => null,
        ]);

        SupplierProduct::factory()->for($product)->for($this->supplier)->create(array_merge([
            'buyer_sku_code' => 'ML5',
            'is_active' => false,
            'buyer_product_status' => true,
        ], $mapping));

        return $product;
    }

    public function test_publish_turns_both_halves_on(): void
    {
        $product = $this->draftProduct();

        $this->postJson("/api/v1/products/{$product->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.publish_state', Product::STATE_PUBLISHED);

        $this->assertTrue((bool) $product->fresh()->status);
        $this->assertTrue((bool) $product->fresh()->supplierProducts->first()->is_active);
        $this->assertSame(1, Catalog::sellableProducts(
            Product::query()->whereKey($product->id)
        )->count());
    }

    public function test_unpublish_takes_it_off_the_storefront_without_deleting_it(): void
    {
        $product = $this->draftProduct();
        $this->postJson("/api/v1/products/{$product->id}/publish")->assertOk();

        $this->postJson("/api/v1/products/{$product->id}/unpublish")
            ->assertOk()
            ->assertJsonPath('data.publish_state', Product::STATE_UNPUBLISHED);

        $fresh = $product->fresh();
        $this->assertFalse((bool) $fresh->status);
        $this->assertFalse((bool) $fresh->supplierProducts->first()->is_active);
        $this->assertSame(0, Catalog::sellableProducts(
            Product::query()->whereKey($product->id)
        )->count());

        // The row is still here — unlisted, not removed.
        $this->assertNotNull(Product::find($product->id));
        $this->assertSame(1, Product::withTrashed()->count());
    }

    public function test_publishing_a_sku_the_provider_switched_off_is_refused(): void
    {
        $product = $this->draftProduct(['buyer_product_status' => false]);

        $this->postJson("/api/v1/products/{$product->id}/publish")
            ->assertStatus(422)
            ->assertJsonPath('message', 'SKU sedang nonaktif di provider.');

        $this->assertFalse((bool) $product->fresh()->status);
    }

    public function test_publishing_a_product_with_no_supplier_is_refused(): void
    {
        $product = Product::factory()->create([
            'category_id' => Category::factory()->create()->id,
            'status' => false,
            'published_at' => null,
        ]);

        $this->postJson("/api/v1/products/{$product->id}/publish")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Produk belum punya mapping supplier.');
    }
}
