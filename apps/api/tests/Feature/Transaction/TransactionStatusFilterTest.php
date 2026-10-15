<?php

namespace Tests\Feature\Transaction;

use App\Enums\PaymentStatus;
use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Filtering the two lifecycles apart.
 *
 * The admin panel has shipped a "Payment Status" dropdown for a while, but it
 * was inert: the SPA never serialized it and the API had no parameter to receive
 * it. These tests pin both halves of that now working, plus the provider filter
 * the new column makes possible.
 */
class TransactionStatusFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create([
            'role_id' => Role::firstOrCreate(['name' => 'Admin'])->id,
        ]);
    }

    private function order(TransactionStatus $status, ?PaymentStatus $payment): Transaction
    {
        $transaction = Transaction::factory()->create(['status' => $status]);

        if ($payment !== null) {
            Payment::factory()->create([
                'transaction_id' => $transaction->id,
                'status' => $payment,
            ]);
        }

        return $transaction;
    }

    public function test_payment_status_narrows_to_orders_the_customer_paid_for(): void
    {
        $paid = $this->order(TransactionStatus::PROCESSING, PaymentStatus::SUCCESS);
        $this->order(TransactionStatus::PENDING, PaymentStatus::PENDING);

        Sanctum::actingAs($this->admin(), ['access-api']);

        $this->getJson('/api/v1/transactions?payment_status=SUCCESS')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', $paid->invoice_number);
    }

    public function test_provider_status_narrows_to_the_suppliers_own_verdict(): void
    {
        $delivered = $this->order(TransactionStatus::COMPLETED, PaymentStatus::SUCCESS);
        $this->order(TransactionStatus::PROCESSING, PaymentStatus::SUCCESS);

        Sanctum::actingAs($this->admin(), ['access-api']);

        $this->getJson('/api/v1/transactions?provider_status='.ProviderStatus::DELIVERED->value)
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', $delivered->invoice_number);
    }

    /**
     * The pair is what makes the split worth having: "the customer paid and the
     * supplier still failed us" was not expressible with one status column.
     */
    public function test_the_two_filters_combine(): void
    {
        $paidButFailed = $this->order(TransactionStatus::FAILED_PROVIDER, PaymentStatus::SUCCESS);
        // Same provider verdict, but the customer never paid — must not match.
        $this->order(TransactionStatus::FAILED_PROVIDER, PaymentStatus::EXPIRED);

        Sanctum::actingAs($this->admin(), ['access-api']);

        $this->getJson('/api/v1/transactions?payment_status=SUCCESS&provider_status='.ProviderStatus::REJECTED->value)
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', $paidButFailed->invoice_number);
    }

    public function test_payment_status_none_finds_orders_with_no_gateway_at_all(): void
    {
        $manual = $this->order(TransactionStatus::COMPLETED, null);
        $this->order(TransactionStatus::COMPLETED, PaymentStatus::SUCCESS);

        Sanctum::actingAs($this->admin(), ['access-api']);

        $this->getJson('/api/v1/transactions?payment_status=NONE')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', $manual->invoice_number);
    }

    public function test_an_unknown_payment_status_returns_nothing_rather_than_everything(): void
    {
        $this->order(TransactionStatus::COMPLETED, PaymentStatus::SUCCESS);

        Sanctum::actingAs($this->admin(), ['access-api']);

        // A silently-ignored filter is worse than an empty result: an operator
        // would read "all orders" as "all matching orders".
        $this->getJson('/api/v1/transactions?payment_status=NOT_A_STATUS')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_the_resource_exposes_both_lifecycles(): void
    {
        $this->order(TransactionStatus::FAILED_PROVIDER, PaymentStatus::SUCCESS);

        Sanctum::actingAs($this->admin(), ['access-api']);

        $this->getJson('/api/v1/transactions')
            ->assertOk()
            // Paid, yet the supplier refused: two facts one column could not hold.
            ->assertJsonPath('data.data.0.payment_status', 'SUCCESS')
            ->assertJsonPath('data.data.0.provider_status', ProviderStatus::REJECTED->value)
            ->assertJsonPath('data.data.0.status', TransactionStatus::FAILED_PROVIDER->value);
    }

    public function test_status_counts_keep_their_legacy_keys_and_gain_the_breakdowns(): void
    {
        $this->order(TransactionStatus::PROCESSING, PaymentStatus::SUCCESS);

        Sanctum::actingAs($this->admin(), ['access-api']);

        $this->getJson('/api/v1/transactions/status-counts')
            ->assertOk()
            // Frozen: the deployed admin SPA reads these directly. `completed`
            // was added alongside them for the "Berhasil" pill.
            ->assertJsonStructure(['data' => ['pending', 'processing', 'completed', 'failed_provider', 'refunded', 'provider', 'payment']])
            ->assertJsonPath('data.processing', 1)
            ->assertJsonPath('data.provider.sending', 1)
            ->assertJsonPath('data.payment.success', 1);
    }
}
