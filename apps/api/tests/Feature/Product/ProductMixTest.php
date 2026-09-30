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
 * Mix products: one sellable row that is delivered by several others.
 *
 * The accumulator is the part that has to be exactly right — the mix's cost is
 * what every price, margin and checkout guard reads, so it is written by the
 * API rather than typed by the admin.
 */
class ProductMixTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    private Supplier $uxiolabs;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $this->category = Category::factory()->create();
        $this->uxiolabs = Supplier::factory()->create(['name' => 'Uxiolabs']);
    }

    private function product(array $overrides = []): Product
    {
        return Product::factory()->create(array_merge([
            'category_id' => $this->category->id,
            'status' => false,
        ], $overrides));
    }

    public function test_it_accumulates_the_cost_from_its_components(): void
    {
        $five = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $ten = $this->product(['code' => 'ML10', 'price_modal' => 5000]);
        $mix = $this->product(['code' => 'ML5+10', 'price_modal' => 0]);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [
                ['product_id' => $five->id, 'quantity' => 2],
                ['product_id' => $ten->id, 'quantity' => 1],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.is_mix', true);

        // 2 × 10.000 + 1 × 5.000
        $this->assertSame(25000, (int) $mix->fresh()->price_modal);
        $this->assertSame(2, $mix->fresh()->mixItems()->count());
    }

    public function test_it_replaces_the_composition_rather_than_appending(): void
    {
        $five = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $ten = $this->product(['code' => 'ML10', 'price_modal' => 5000]);
        $mix = $this->product(['code' => 'MIX', 'price_modal' => 0]);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $five->id, 'quantity' => 1]],
        ])->assertOk();

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $ten->id, 'quantity' => 3]],
        ])->assertOk();

        $this->assertSame(1, $mix->fresh()->mixItems()->count());
        $this->assertSame(15000, (int) $mix->fresh()->price_modal);
    }

    public function test_clearing_the_mix_removes_every_line(): void
    {
        $five = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $mix = $this->product(['code' => 'MIX', 'price_modal' => 0]);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $five->id, 'quantity' => 1]],
        ])->assertOk();

        $this->postJson("/api/v1/products/{$mix->id}/mix", ['items' => []])->assertOk();

        $this->assertSame(0, $mix->fresh()->mixItems()->count());
    }

    public function test_a_product_cannot_be_its_own_component(): void
    {
        $mix = $this->product(['code' => 'MIX']);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $mix->id, 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Sebuah produk tidak boleh menjadi komponen dirinya sendiri.');
    }

    public function test_a_mix_cannot_be_nested_inside_another_mix(): void
    {
        $component = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $inner = $this->product(['code' => 'INNER']);

        $this->postJson("/api/v1/products/{$inner->id}/mix", [
            'items' => [['product_id' => $component->id, 'quantity' => 1]],
        ])->assertOk();

        $outer = $this->product(['code' => 'OUTER']);

        $this->postJson("/api/v1/products/{$outer->id}/mix", [
            'items' => [['product_id' => $inner->id, 'quantity' => 1]],
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Produk mix tidak boleh menjadi komponen mix lain.');
    }

    public function test_the_same_component_twice_is_refused(): void
    {
        $component = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $mix = $this->product(['code' => 'MIX']);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [
                ['product_id' => $component->id, 'quantity' => 1],
                ['product_id' => $component->id, 'quantity' => 2],
            ],
        ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Komponen yang sama muncul lebih dari sekali.');
    }

    /**
     * A mix is sellable through its components, so it cannot go on sale before
     * they do: half a mix is not something the supplier can deliver.
     */
    public function test_a_mix_cannot_be_published_until_its_components_are_live(): void
    {
        $component = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $mix = $this->product(['code' => 'MIX', 'price_modal' => 0]);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $component->id, 'quantity' => 1]],
        ])->assertOk();

        $this->postJson("/api/v1/products/{$mix->id}/publish")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Semua komponen mix harus sudah tayang dulu sebelum mix-nya bisa ditayangkan.');
    }

    public function test_a_mix_goes_live_once_every_component_is_live(): void
    {
        $component = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        SupplierProduct::factory()->for($component)->for($this->uxiolabs)->create([
            'buyer_sku_code' => 'ML5',
            'is_active' => true,
            'buyer_product_status' => true,
        ]);
        $this->postJson("/api/v1/products/{$component->id}/publish")->assertOk();

        $mix = $this->product(['code' => 'MIX', 'price_modal' => 0]);
        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $component->id, 'quantity' => 1]],
        ])->assertOk();

        $this->postJson("/api/v1/products/{$mix->id}/publish")->assertOk();

        $this->assertSame(1, Catalog::sellableProducts(Product::query()->whereKey($mix->id))->count());
    }

    public function test_the_resource_reports_the_composition(): void
    {
        $component = $this->product(['code' => 'ML5', 'price_modal' => 10000]);
        $mix = $this->product(['code' => 'MIX', 'price_modal' => 0]);

        $this->postJson("/api/v1/products/{$mix->id}/mix", [
            'items' => [['product_id' => $component->id, 'quantity' => 2]],
        ])->assertOk();

        $this->getJson("/api/v1/products/{$mix->id}")
            ->assertOk()
            ->assertJsonPath('data.is_mix', true)
            ->assertJsonPath('data.mix_items.0.code', 'ML5')
            ->assertJsonPath('data.mix_items.0.quantity', 2)
            ->assertJsonPath('data.mix_items.0.cost', 10000);
    }
}
