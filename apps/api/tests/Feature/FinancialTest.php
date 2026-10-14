<?php

namespace Tests\Feature;

use App\Models\Payment;
use App\Models\PaymentChannel;
use App\Models\RefundRequest;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinancialTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_financial_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/financial/summary')->assertUnauthorized();
        $this->getJson('/api/v1/financial/payment-gateways')->assertUnauthorized();
        $this->getJson('/api/v1/financial/suppliers')->assertUnauthorized();
    }

    public function test_summary_returns_credit_debit_and_profit_cards(): void
    {
        $this->actingAsAdmin();
        $channel = PaymentChannel::factory()->create();

        $completed = Transaction::factory()->create(['status' => 'COMPLETED', 'margin' => 3000]);
        Payment::factory()->create([
            'transaction_id' => $completed->id,
            'payment_channel_id' => $channel->id,
            'status' => '3', // SUCCESS
            'gross_amount' => 15000,
            'paid_at' => now(),
        ]);

        $refundedTx = Transaction::factory()->create(['status' => 'REFUNDED']);
        $refundedPayment = Payment::factory()->create([
            'transaction_id' => $refundedTx->id,
            'payment_channel_id' => $channel->id,
            'status' => '4', // REFUNDED
            'gross_amount' => 5000,
            'paid_at' => now(),
        ]);
        // Debit is summed from the refund ledger by `refunded_at`, not from the
        // payment by `paid_at`: a guest's manual transfer settles days after
        // the order was paid, and dating it by the payment would file the money
        // as having left in a month it was still in the account.
        RefundRequest::factory()->balance()->create([
            'transaction_id' => $refundedTx->id,
            'payment_id' => $refundedPayment->id,
            'amount' => 5000,
            'refunded_at' => now(),
        ]);

        $response = $this->getJson('/api/v1/financial/summary')->assertOk();
        $cards = collect($response->json('data'))->keyBy('key');

        $this->assertSame(15000, $cards['credit']['value']);
        $this->assertSame(5000, $cards['debit']['value']);
        $this->assertSame(3000, $cards['profit']['value']);
    }

    public function test_payment_gateways_returns_monetapay_balance_on_success(): void
    {
        $this->actingAsAdmin();
        Http::fake(['*/v1.0.0/balance' => Http::response([
            'code' => 0,
            'messgae' => 'success',
            'data' => ['current_balance' => '1000000', 'current_freeze' => '50000'],
        ], 200)]);

        $this->getJson('/api/v1/financial/payment-gateways')
            ->assertOk()
            ->assertJsonPath('data.0.id', 'monetapay')
            ->assertJsonPath('data.0.active_balance', 1000000)
            ->assertJsonPath('data.0.held_balance', 50000);
    }

    public function test_payment_gateways_degrades_gracefully_when_monetapay_is_unreachable(): void
    {
        $this->actingAsAdmin();
        Http::fake(['*/v1.0.0/balance' => Http::response(['message' => 'error'], 500)]);

        $this->getJson('/api/v1/financial/payment-gateways')
            ->assertOk()
            ->assertJsonPath('data.0.active_balance', null)
            ->assertJsonPath('data.0.held_balance', null);
    }

    public function test_suppliers_lists_only_the_channels_that_can_report_a_balance(): void
    {
        $this->actingAsAdmin();
        Supplier::factory()->create(['name' => 'Uxiolabs']);
        // Seeded rows with no API behind them. They used to be listed as a
        // permanent "—", which reads as a channel that is down.
        Supplier::factory()->create(['name' => 'VIP Reseller']);
        Supplier::factory()->create(['name' => 'Internal System']);
        Http::fake(['*/saldo' => Http::response(['status' => true, 'msg' => 'berhasil', 'data' => ['saldo' => 500000]], 200)]);

        $response = $this->getJson('/api/v1/financial/suppliers')->assertOk();

        $response->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Uxiolabs');

        $this->assertEquals(500000, $response->json('data.0.balance'));
    }
}
