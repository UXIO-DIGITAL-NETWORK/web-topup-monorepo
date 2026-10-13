<?php

namespace Tests\Feature\Product;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Product\DeleteProductAction;
use App\Models\Category;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use App\Support\Storefront\Catalog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Deleting a Main Product used to be impossible the moment it had sold anything:
 * `transactions.product_id` is NOT NULL and RESTRICT, and nothing caught the
 * QueryException, so the admin got a bare 500 and the row could never be removed.
 *
 * It archives now. Nothing is deleted, so the constraint is never tested and the
 * order history keeps resolving — which is the whole point, and the part most
 * likely to regress quietly.
 */
class ArchiveProductTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    private function product(): Product
    {
        return Product::factory()->create([
            'category_id' => Category::factory()->create(['status' => true])->id,
            'status' => true,
            'price_modal' => 10000,
            'price_member' => 12000,
            'price_vip' => 11500,
            'price_reseller' => 11000,
            'price_agent' => 10500,
        ]);
    }

    private function mappingFor(Product $product): SupplierProduct
    {
        return SupplierProduct::factory()->create([
            'product_id' => $product->id,
            'supplier_id' => Supplier::factory()->create()->id,
            'is_active' => true,
            'margin_set_at' => now(),
            'margin_member' => 20,
            'price' => 10000,
        ]);
    }

    private function soldOnce(Product $product): Transaction
    {
        return Transaction::factory()->create([
            'product_id' => $product->id,
            'payment_channel_id' => PaymentChannel::factory()->create()->id,
        ]);
    }

    public function test_a_product_that_has_sold_can_still_be_archived(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $this->mappingFor($product);
        $transaction = $this->soldOnce($product);

        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $this->assertSoftDeleted('products', ['id' => $product->id]);
        // The row it points at still exists — that is what makes the FK moot.
        $this->assertDatabaseHas('transactions', ['id' => $transaction->id, 'product_id' => $product->id]);
    }

    public function test_the_order_history_still_resolves_its_product(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $this->mappingFor($product);
        $transaction = $this->soldOnce($product);

        (new DeleteProductAction(app(CreateActivityLogAction::class)))->execute($product);

        // withTrashed on the relation, or every screen below reads null.
        $this->assertSame($product->id, $transaction->fresh()->product?->id);

        // ProductResource dereferences $this->id straight through, so a null
        // relation fatals rather than renders blank. Both of these embed it.
        $this->getJson('/api/v1/transactions')->assertOk();
        $this->getJson('/api/v1/dashboard/stats')->assertOk();
    }

    public function test_transaction_history_keeps_the_products_identity_when_it_is_renamed(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $this->mappingFor($product);
        $transaction = $this->soldOnce($product);

        // What checkout would have frozen.
        $transaction->update(['product_name' => 'Edisi Lama', 'product_code' => 'MLBB_100']);

        // Renaming the product must not rewrite what the order sold.
        $product->update(['name' => 'Edisi Baru', 'code' => 'MLBB_999']);

        $this->getJson('/api/v1/transactions')
            ->assertOk()
            ->assertJsonPath('data.data.0.product_name', 'Edisi Lama')
            ->assertJsonPath('data.data.0.product_code', 'MLBB_100');
    }

    public function test_the_provider_inactive_filter_surfaces_only_switched_off_mappings(): void
    {
        $this->actingAsAdmin();
        $inactive = $this->product();
        $this->mappingFor($inactive)->update(['buyer_product_status' => false]);
        $live = $this->product();
        $this->mappingFor($live);

        $this->getJson('/api/v1/products')
            ->assertOk()
            ->assertJsonCount(2, 'data.data');

        $this->getJson('/api/v1/products?provider_inactive=1')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $inactive->id)
            ->assertJsonPath('data.data.0.provider_inactive', true);
    }

    public function test_archiving_returns_the_sku_to_the_pool_ready_to_re_promote(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $mapping = $this->mappingFor($product);

        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $mapping->refresh();
        $this->assertNull($mapping->product_id);
        $this->assertFalse((bool) $mapping->is_active);
        $this->assertSame($product->category_id, $mapping->pool_category_id);
        // Margins survive, so the SKU lands as READY rather than needing pricing
        // all over again.
        $this->assertNotNull($mapping->margin_set_at);
        $this->assertSame(SupplierProduct::STATE_READY, $mapping->poolState());
    }

    public function test_an_archived_product_leaves_the_storefront(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $this->mappingFor($product);

        $this->assertSame(1, Catalog::sellableProducts(Product::query()->whereKey($product->id))->count());

        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $this->assertSame(0, Catalog::sellableProducts(Product::query()->whereKey($product->id))->count());
        $this->assertSame(0, Catalog::sellableGames()->count());
    }

    public function test_the_admin_list_hides_archived_products_unless_asked(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $this->mappingFor($product);
        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $this->getJson('/api/v1/products')->assertOk()->assertJsonCount(0, 'data.data');

        $this->getJson('/api/v1/products?publish_state=archived')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.publish_state', Product::STATE_ARCHIVED);
    }

    public function test_restore_brings_it_back_unpublished_with_its_sku_reattached(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $mapping = $this->mappingFor($product);
        $product->update(['code' => $mapping->buyer_sku_code, 'published_at' => now()]);

        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();
        $this->postJson("/api/v1/products/{$product->id}/restore")
            ->assertOk()
            // Never straight back on sale: undoing a mistake must not look like
            // making a new one.
            ->assertJsonPath('data.publish_state', Product::STATE_UNPUBLISHED);

        $this->assertNotSoftDeleted('products', ['id' => $product->id]);
        $this->assertDatabaseHas('supplier_products', [
            'id' => $mapping->id, 'product_id' => $product->id, 'is_active' => false,
        ]);
    }

    public function test_a_re_promoted_sku_cannot_be_claimed_back_by_a_restore(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $mapping = $this->mappingFor($product);
        $product->update(['code' => $mapping->buyer_sku_code]);

        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        // The SKU has moved on to a different product.
        $other = $this->product();
        $mapping->refresh()->update(['product_id' => $other->id]);

        $this->postJson("/api/v1/products/{$product->id}/restore")
            ->assertStatus(422)
            ->assertJsonPath('message', 'SKU produk ini sudah dipakai produk lain.');

        $this->assertSoftDeleted('products', ['id' => $product->id]);
    }

    /**
     * `products.code` is a stable catalogue identity: an archived product still
     * holds its code, and archiving freed this very SKU back to the pool. So
     * promoting the SKU whose code belongs to that archived product is the admin
     * asking for it back — it RESTORES the product (unpublished, SKU reattached)
     * rather than refusing and stranding the admin on the pool screen. There is
     * no second draft and no unique-index clash.
     */
    public function test_re_promoting_the_sku_restores_the_archived_product(): void
    {
        $this->actingAsAdmin();
        $product = $this->product();
        $mapping = $this->mappingFor($product);
        $product->update(['code' => $mapping->buyer_sku_code, 'published_at' => now()]);

        $this->deleteJson("/api/v1/products/{$product->id}")->assertOk();
        $this->assertSoftDeleted('products', ['id' => $product->id]);

        $this->postJson("/api/v1/supplier-products/{$mapping->id}/promote")->assertStatus(201);

        // The same product is back — not a duplicate — and never straight on sale.
        $this->assertNotSoftDeleted('products', ['id' => $product->id]);
        $this->assertSame(1, Product::withTrashed()->where('code', $mapping->buyer_sku_code)->count());
        $this->assertSame(Product::STATE_UNPUBLISHED, $product->fresh()->load('supplierProducts')->publishState());
        $this->assertDatabaseHas('supplier_products', [
            'id' => $mapping->id, 'product_id' => $product->id, 'is_active' => false,
        ]);
    }

    /**
     * Restore only reuses an ARCHIVED product's code. A live (or draft) product
     * already owning the code is a genuine clash the admin has to resolve.
     */
    public function test_promoting_onto_a_live_products_code_is_still_refused(): void
    {
        $this->actingAsAdmin();
        $live = $this->product();
        $live->update(['code' => 'VAL_475_S1']);

        $mapping = SupplierProduct::factory()->create([
            'product_id' => null,
            'pool_category_id' => $live->category_id,
            'supplier_id' => Supplier::factory()->create()->id,
            'buyer_sku_code' => 'VAL_475_S1',
            'price' => 10000,
            'margin_member' => 20,
            'margin_set_at' => now(),
            'is_active' => false,
            'buyer_product_status' => true,
        ]);

        $this->postJson("/api/v1/supplier-products/{$mapping->id}/promote")
            ->assertStatus(422)
            ->assertJsonPath('message', "Kode produk 'VAL_475_S1' sudah dipakai produk lain.");
    }
}
