<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Role;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionActionsTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_status_counts_require_authentication(): void
    {
        $this->getJson('/api/v1/transactions/status-counts')->assertUnauthorized();
    }

    public function test_status_counts_reflects_real_statuses(): void
    {
        $this->actingAsAdmin();
        Transaction::factory()->count(2)->create(['status' => 'PENDING']);
        Transaction::factory()->create(['status' => 'PROCESSING']);
        Transaction::factory()->create(['status' => 'FAILED_PROVIDER']);
        Transaction::factory()->create(['status' => 'COMPLETED']);

        $this->getJson('/api/v1/transactions/status-counts')
            ->assertOk()
            ->assertJsonPath('data.pending', 2)
            ->assertJsonPath('data.processing', 1)
            ->assertJsonPath('data.completed', 1)
            ->assertJsonPath('data.failed_provider', 1);
    }

    public function test_manual_review_updates_status_sn_and_proof(): void
    {
        $this->actingAsAdmin();
        $transaction = Transaction::factory()->create(['status' => 'PROCESSING']);

        $this->postJson("/api/v1/transactions/{$transaction->id}/manual-review", [
            'status' => 'COMPLETED',
            'sn' => 'SN-00123',
            'proof' => UploadedFile::fake()->image('proof.jpg'),
        ])->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.sn', 'SN-00123');

        $this->assertNotNull($transaction->fresh()->proof);
    }

    public function test_refund_credits_wallet_balance_for_the_balance_channel(): void
    {
        $this->actingAsAdmin();
        // Explicit role: UserFactory's default role_id (random 1-5) assumes
        // roles already exist, which isn't guaranteed in an isolated test transaction.
        $memberRole = Role::factory()->create(['name' => 'Member']);
        $customer = User::factory()->create(['balance' => 0, 'role_id' => $memberRole->id]);
        $channel = PaymentChannel::factory()->balance()->create();
        $transaction = Transaction::factory()->create([
            'user_id' => $customer->id,
            'payment_channel_id' => $channel->id,
            'status' => 'FAILED_PROVIDER',
        ]);
        Payment::factory()->create([
            'transaction_id' => $transaction->id,
            'payment_channel_id' => $channel->id,
            'gross_amount' => 12000,
            'status' => '3', // SUCCESS
        ]);

        $this->postJson("/api/v1/transactions/{$transaction->id}/refund", ['reason' => 'Supplier out of stock'])
            ->assertOk();

        $this->assertSame(12000.0, (float) $customer->fresh()->balance);
    }

    public function test_resend_callback_rejects_a_non_processing_transaction(): void
    {
        $this->actingAsAdmin();
        $transaction = Transaction::factory()->create(['status' => 'COMPLETED']);

        $this->postJson("/api/v1/transactions/{$transaction->id}/resend-callback")
            ->assertUnprocessable();
    }

    public function test_resend_callback_syncs_status_from_uxiolabs(): void
    {
        $this->actingAsAdmin();
        $product = Product::factory()->create();
        SupplierProduct::factory()->create(['product_id' => $product->id, 'is_active' => true]);
        $transaction = Transaction::factory()->create([
            'product_id' => $product->id,
            'status' => 'PROCESSING',
            'supplier_trx_id' => 'UXORDER-999', // /status polls by uxiolabs's own invoice
        ]);

        Http::fake(['*/status' => Http::response([
            'status' => true,
            'msg' => 'berhasil mengecek status',
            'data' => ['id' => 'UXORDER-999', 'keterangan' => 'SN-999', 'status' => 'success'],
        ])]);

        $this->postJson("/api/v1/transactions/{$transaction->id}/resend-callback")
            ->assertOk()
            ->assertJsonPath('data.status', 'COMPLETED')
            ->assertJsonPath('data.sn', 'SN-999');
    }

    public function test_retry_redispatches_to_uxiolabs(): void
    {
        $this->actingAsAdmin();
        $product = Product::factory()->create();
        SupplierProduct::factory()->create(['product_id' => $product->id, 'is_active' => true]);
        $transaction = Transaction::factory()->create(['product_id' => $product->id, 'status' => 'FAILED_PROVIDER']);

        Http::fake(['*/order' => Http::response([
            'status' => true,
            'msg' => 'ok',
            'data' => ['status' => 'pending', 'keterangan' => '', 'id' => 'UXORDER-000'],
        ])]);

        $this->postJson("/api/v1/transactions/{$transaction->id}/retry")
            ->assertOk()
            ->assertJsonPath('data.status', 'PROCESSING')
            ->assertJsonPath('data.supplier_trx_id', 'UXORDER-000');
    }

    /**
     * A retried order that already reached uxiolabs hits their duplicate-idtrx
     * guard — the retry must settle to PROCESSING (awaiting callback), never
     * double-order or error out.
     */
    public function test_retry_after_duplicate_idtrx_settles_to_processing(): void
    {
        $this->actingAsAdmin();
        $product = Product::factory()->create();
        SupplierProduct::factory()->create(['product_id' => $product->id, 'is_active' => true]);
        $transaction = Transaction::factory()->create(['product_id' => $product->id, 'status' => 'FAILED_PROVIDER']);

        Http::fake(['*/order' => Http::response([
            'status' => false,
            'msg' => 'idtrx sudah ada',
            'data' => [],
        ])]);

        $this->postJson("/api/v1/transactions/{$transaction->id}/retry")
            ->assertOk()
            ->assertJsonPath('data.status', 'PROCESSING');
    }
}
