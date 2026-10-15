<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\Role;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionListTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_transactions_require_authentication(): void
    {
        $this->getJson('/api/v1/transactions')->assertUnauthorized();
    }

    public function test_filters_by_status_and_search(): void
    {
        $this->actingAsAdmin();
        Transaction::factory()->create(['status' => 'PENDING', 'invoice_number' => 'INV-AAA']);
        Transaction::factory()->create(['status' => 'COMPLETED', 'invoice_number' => 'INV-BBB']);

        $this->getJson('/api/v1/transactions?status=PENDING')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', 'INV-AAA');

        $this->getJson('/api/v1/transactions?search=BBB')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', 'INV-BBB');
    }

    public function test_filters_by_user_product_and_date_range(): void
    {
        $this->actingAsAdmin();
        $memberRole = Role::factory()->create(['name' => 'Member']);
        $user = User::factory()->create(['role_id' => $memberRole->id]);
        $product = Product::factory()->create();

        $inScope = Transaction::factory()->create([
            'user_id' => $user->id,
            'product_id' => $product->id,
            'created_at' => now()->subDays(2),
        ]);
        Transaction::factory()->create(['created_at' => now()->subDays(2)]); // different user/product
        Transaction::factory()->create([
            'user_id' => $user->id,
            'product_id' => $product->id,
            'created_at' => now()->subDays(20), // outside the date range
        ]);

        $this->getJson('/api/v1/transactions?'.http_build_query([
            'user_id' => $user->id,
            'product_id' => $product->id,
            'start_date' => now()->subDays(5)->toDateString(),
            'end_date' => now()->toDateString(),
        ]))
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $inScope->id);
    }

    /**
     * A category is not a column on the order — it is the game the sold product
     * belongs to. This is what the admin's Kategori dropdown asks for.
     */
    public function test_filters_by_the_products_category(): void
    {
        $this->actingAsAdmin();
        $mlbb = Category::factory()->create(['name' => 'Mobile Legends']);
        $freeFire = Category::factory()->create(['name' => 'Free Fire']);
        $mlbbProduct = Product::factory()->create(['category_id' => $mlbb->id]);
        $freeFireProduct = Product::factory()->create(['category_id' => $freeFire->id]);

        $inScope = Transaction::factory()->create(['product_id' => $mlbbProduct->id]);
        Transaction::factory()->create(['product_id' => $freeFireProduct->id]);

        $this->getJson('/api/v1/transactions?category_id='.$mlbb->id)
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $inScope->id);
    }

    public function test_filters_members_apart_from_guests(): void
    {
        $this->actingAsAdmin();
        $role = Role::factory()->create(['name' => 'Member']);
        $member = User::factory()->create(['role_id' => $role->id]);

        $memberOrder = Transaction::factory()->create(['user_id' => $member->id]);
        $guestOrder = Transaction::factory()->create(['user_id' => null, 'guest_contact' => '081234567890']);

        $this->getJson('/api/v1/transactions?customer_type=member')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $memberOrder->id);

        $this->getJson('/api/v1/transactions?customer_type=guest')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $guestOrder->id);
    }

    /**
     * A filter the API cannot honour must match nothing rather than quietly
     * matching everything — otherwise a typo reads as "no such order exists".
     * The same rule the payment-status filter follows.
     */
    public function test_an_unknown_customer_type_matches_nothing(): void
    {
        $this->actingAsAdmin();
        Transaction::factory()->count(2)->create();

        $this->getJson('/api/v1/transactions?customer_type=reseller')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_sorts_by_amount_total_ascending(): void
    {
        $this->actingAsAdmin();
        Transaction::factory()->create(['amount_total' => 50000, 'invoice_number' => 'INV-HIGH']);
        Transaction::factory()->create(['amount_total' => 10000, 'invoice_number' => 'INV-LOW']);

        $this->getJson('/api/v1/transactions?sort_by=amount_total&sort_dir=asc')
            ->assertOk()
            ->assertJsonPath('data.data.0.invoice_number', 'INV-LOW')
            ->assertJsonPath('data.data.1.invoice_number', 'INV-HIGH');
    }

    public function test_rejects_an_unwhitelisted_sort_column_and_falls_back_to_created_at(): void
    {
        $this->actingAsAdmin();
        $older = Transaction::factory()->create(['created_at' => now()->subDay()]);
        $newer = Transaction::factory()->create(['created_at' => now()]);

        $this->getJson('/api/v1/transactions?sort_by=margin&sort_dir=asc')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $older->id)
            ->assertJsonPath('data.data.1.id', $newer->id);
    }

    /**
     * The admin table renders the product's category as its "Game" column.
     * ProductResource only emits `category` when the relation is loaded, so
     * without it every row's Game cell is silently blank.
     */
    public function test_index_includes_the_products_category(): void
    {
        $this->actingAsAdmin();
        $category = Category::factory()->create(['name' => 'Mobile Legends']);
        $product = Product::factory()->create(['category_id' => $category->id]);
        Transaction::factory()->create(['product_id' => $product->id]);

        $this->getJson('/api/v1/transactions')
            ->assertOk()
            ->assertJsonPath('data.data.0.product.category.name', 'Mobile Legends');
    }
}
