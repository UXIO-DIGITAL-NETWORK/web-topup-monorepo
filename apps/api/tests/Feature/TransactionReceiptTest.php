<?php

namespace Tests\Feature;

use App\Actions\Transaction\SendTransactionReceiptAction;
use App\Mail\TransactionReceiptMail;
use App\Models\InvoiceDeliveryLog;
use App\Models\PaymentChannel;
use App\Models\Product;
use App\Models\Role;
use App\Models\SupplierProduct;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TransactionReceiptTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $email = 'buyer@example.com', int $balance = 100000): User
    {
        $role = Role::factory()->create(['name' => 'Member']);
        $user = User::factory()->create(['role_id' => $role->id, 'email' => $email, 'balance' => $balance]);
        Sanctum::actingAs($user, ['access-api']);

        return $user;
    }

    public function test_receipt_is_delivered_and_logged_when_a_balance_checkout_completes(): void
    {
        Mail::fake();
        Http::fake(['*/order' => Http::response(['status' => true, 'msg' => 'ok', 'data' => ['status' => 'success', 'keterangan' => 'SN-1', 'id' => 'UX1']])]);

        config(['services.uxiolabs.api_key' => 'test-api-key']);
        $product = Product::factory()->create(['price_member' => 12000]);
        SupplierProduct::factory()->for($product)->create(['price' => 10000]);
        $channel = PaymentChannel::factory()->balance()->create();
        $user = $this->member();

        $this->postJson('/api/v1/checkout', [
            'product_id' => $product->id,
            'payment_channel_id' => $channel->id,
            'target_uid' => '12345678',
            'email' => 'buyer@example.com',
            'locale' => 'en',
        ])->assertCreated();

        // The send is owned by the job, so the trail records the outcome rather
        // than the intent to try.
        $log = InvoiceDeliveryLog::where('channel', InvoiceDeliveryLog::CHANNEL_EMAIL)->sole();
        $this->assertSame(InvoiceDeliveryLog::STATUS_SENT, $log->status);
        $this->assertSame($user->email, $log->recipient);
        $this->assertNotNull(Transaction::first()->receipt_sent_at);
    }

    public function test_receipt_is_not_sent_twice(): void
    {
        Mail::fake();
        $transaction = Transaction::factory()->create([
            'contact_email' => 'guest@example.com',
            'receipt_sent_at' => null,
        ]);

        $action = app(SendTransactionReceiptAction::class);
        $this->assertTrue($action->execute($transaction));
        $this->assertFalse($action->execute($transaction->fresh())); // idempotent

        $this->assertSame(1, InvoiceDeliveryLog::where('channel', InvoiceDeliveryLog::CHANNEL_EMAIL)->count());
    }

    public function test_admin_resend_forces_a_new_receipt(): void
    {
        Mail::fake();
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $transaction = Transaction::factory()->create([
            'contact_email' => 'guest@example.com',
            'receipt_sent_at' => now(), // already sent
        ]);

        $this->postJson("/api/v1/transactions/{$transaction->id}/resend-receipt")->assertOk();

        // Force bypasses the idempotency guard, and the trail says so.
        $log = InvoiceDeliveryLog::where('channel', InvoiceDeliveryLog::CHANNEL_EMAIL)->sole();
        $this->assertSame(InvoiceDeliveryLog::STATUS_SENT, $log->status);
        $this->assertSame('guest@example.com', $log->recipient);
        $this->assertTrue($log->is_resend);
    }

    public function test_receipt_html_renders_in_both_locales(): void
    {
        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-RENDER',
            'amount_base' => 25000,
            'amount_fee' => 1000,
            'discount_amount' => 2000,
            'amount_total' => 24000,
            'sn' => 'SN-9',
            'contact_email' => 'g@example.com',
        ]);

        // A real domain, because that is the production condition — the track
        // CTA is deliberately dropped when the storefront base is unreachable.
        config(['services.storefront.url' => 'https://topupgame.id']);

        app()->setLocale('id');
        $idHtml = (new TransactionReceiptMail($transaction, 'id'))->render();
        $this->assertStringContainsString('Bukti Pembelian', $idHtml);
        $this->assertStringContainsString('Rp 24.000', $idHtml);
        $this->assertStringContainsString('linear-gradient', $idHtml);
        $this->assertStringContainsString('cek-pesanan', $idHtml);

        app()->setLocale('en');
        $enHtml = (new TransactionReceiptMail($transaction, 'en'))->render();
        $this->assertStringContainsString('Purchase Receipt', $enHtml);
        $this->assertStringContainsString('Total Paid', $enHtml);
    }

    public function test_the_receipt_drops_the_track_cta_rather_than_linking_to_a_dev_box(): void
    {
        // Unlike the refund claim link, a receipt is still worth sending
        // without its CTA — so this omits the button rather than stopping the
        // send. What it must never do is render a localhost URL to a customer.
        config(['services.storefront.url' => 'http://localhost:5173']);

        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-NO-CTA',
            'contact_email' => 'g@example.com',
        ]);

        $html = (new TransactionReceiptMail($transaction, 'id'))->render();

        $this->assertStringNotContainsString('localhost', $html);
        $this->assertStringNotContainsString('cek-pesanan', $html);
        // The receipt itself still arrives intact.
        $this->assertStringContainsString('INV-NO-CTA', $html);
    }

    public function test_receipt_subject_is_localised(): void
    {
        $transaction = Transaction::factory()->create(['invoice_number' => 'INV-XYZ', 'contact_email' => 'g@example.com']);

        $id = new TransactionReceiptMail($transaction, 'id');
        $en = new TransactionReceiptMail($transaction, 'en');

        // The subject resolves through the current app locale (the send path sets
        // it via Mail::to()->locale()).
        app()->setLocale('id');
        $this->assertStringContainsString('Bukti Pembelian', $id->envelope()->subject);
        app()->setLocale('en');
        $this->assertStringContainsString('Purchase Receipt', $en->envelope()->subject);
    }
}
