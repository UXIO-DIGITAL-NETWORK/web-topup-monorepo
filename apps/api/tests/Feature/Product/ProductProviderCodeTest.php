<?php

namespace Tests\Feature\Product;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The product's provider SKU. `products.code` is the admin's internal code, so
 * the supplier's own `buyer_sku_code` has to travel on the resource for the edit
 * form to show both without a second request.
 */
class ProductProviderCodeTest extends TestCase
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

    public function test_it_exposes_the_active_mappings_buyer_sku_code(): void
    {
        $product = Product::factory()->create(['category_id' => Category::factory()->create()->id]);

        SupplierProduct::factory()->for($product)->for($this->supplier)->create([
            'buyer_sku_code' => 'ML5-OFF',
            'is_active' => false,
        ]);
        SupplierProduct::factory()->for($product)->for($this->supplier)->create([
            'buyer_sku_code' => 'ML5-ON',
            'is_active' => true,
        ]);

        $this->getJson("/api/v1/products/{$product->id}")
            ->assertOk()
            ->assertJsonPath('data.provider_sku_code', 'ML5-ON');
    }

    public function test_it_is_null_without_a_supplier_mapping(): void
    {
        $product = Product::factory()->create(['category_id' => Category::factory()->create()->id]);

        $this->getJson("/api/v1/products/{$product->id}")
            ->assertOk()
            ->assertJsonPath('data.provider_sku_code', null);
    }
}
