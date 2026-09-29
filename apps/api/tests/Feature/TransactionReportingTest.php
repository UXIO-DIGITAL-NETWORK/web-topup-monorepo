<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Role;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionReportingTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_export_requires_admin(): void
    {
        $this->getJson('/api/v1/transactions/export')->assertUnauthorized();
    }

    public function test_export_streams_a_csv_of_matching_rows(): void
    {
        $this->actingAsAdmin();
        Transaction::factory()->create(['invoice_number' => 'INV-EXPORT-1', 'status' => 'COMPLETED']);

        $response = $this->get('/api/v1/transactions/export');

        $response->assertOk();
        $this->assertStringContainsString('text/csv', $response->headers->get('content-type'));
        $body = $response->streamedContent();
        $this->assertStringContainsString('Invoice', $body);
        $this->assertStringContainsString('INV-EXPORT-1', $body);
    }

    public function test_export_neutralises_a_formula_in_a_customer_supplied_value(): void
    {
        $this->actingAsAdmin();
        // A guest's contact is free text an operator later opens in Excel; a
        // leading "=" would be run as a formula. The export must quote it into
        // text instead.
        Transaction::factory()->create([
            'invoice_number' => 'INV-FORMULA-1',
            'user_id' => null,
            'guest_contact' => '=1+1',
            'status' => 'COMPLETED',
        ]);

        $body = $this->get('/api/v1/transactions/export')->streamedContent();

        $this->assertStringContainsString("'=1+1", $body);
    }

    public function test_recap_groups_completed_transactions_per_product(): void
    {
        $this->actingAsAdmin();
        $product = Product::factory()->create(['name' => 'Genshin 60 Crystals']);
        Transaction::factory()->count(2)->create([
            'product_id' => $product->id,
            'status' => 'COMPLETED',
            'amount_total' => 10000,
        ]);
        // A non-completed row must be excluded from the recap.
        Transaction::factory()->create(['product_id' => $product->id, 'status' => 'PENDING', 'amount_total' => 99999]);

        $this->getJson('/api/v1/transactions/recap?period=daily')
            ->assertOk()
            ->assertJsonPath('data.total_count', 2)
            ->assertJsonPath('data.total_revenue', 20000)
            ->assertJsonPath('data.breakdown.0.label', 'Genshin 60 Crystals')
            ->assertJsonPath('data.breakdown.0.count', 2);
    }

    public function test_resend_receipt_records_the_action(): void
    {
        $this->actingAsAdmin();
        $transaction = Transaction::factory()->create(['status' => 'COMPLETED']);

        $this->postJson("/api/v1/transactions/{$transaction->id}/resend-receipt")
            ->assertOk()
            ->assertJsonPath('data.invoice_number', $transaction->invoice_number);

        $this->assertDatabaseHas('activity_logs', ['transaction_id' => $transaction->id]);
    }
}
