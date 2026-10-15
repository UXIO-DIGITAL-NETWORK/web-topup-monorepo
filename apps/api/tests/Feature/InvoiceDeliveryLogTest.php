<?php

namespace Tests\Feature;

use App\Actions\Transaction\SendTransactionReceiptAction;
use App\Jobs\SendTransactionReceiptMailJob;
use App\Jobs\SendTransactionWhatsAppJob;
use App\Mail\TransactionReceiptMail;
use App\Models\InvoiceDeliveryLog;
use App\Models\Role;
use App\Models\Transaction;
use App\Models\User;
use App\Services\PiWapiService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * The invoice-delivery trail: what went out, over which channel, and whether it
 * arrived.
 *
 * The point of these tests is the distinction the old columns could not make —
 * "queued" is not "delivered", and "no receipt" always has a reason.
 */
class InvoiceDeliveryLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Reachable, so an outcome can be reported at all; the HTTP itself is
        // faked per test.
        config(['services.discord.webhook_log_url' => 'https://discord.test/hook']);
        Http::fake(['https://discord.test/*' => Http::response([], 204)]);
    }

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    private function configurePiwapi(): void
    {
        config([
            'services.piwapi.enabled' => true,
            'services.piwapi.api_url' => 'https://piwapi.test/send',
            'services.piwapi.account' => 'acc-1',
            'services.piwapi.secret' => 'sec-1',
        ]);
    }

    /**
     * Only the invoice-delivery traffic. Creating a transaction already posts its
     * own Discord notice, so counting every embed would measure the factory.
     *
     * @return array<int,string> the description of each invoice message posted
     */
    private function invoiceMessages(): array
    {
        return collect(Http::recorded())
            ->filter(fn (array $pair) => str_contains($pair[0]->url(), 'discord.test'))
            ->map(fn (array $pair) => $pair[0]['embeds'][0]['description'] ?? '')
            ->filter(fn (string $description) => str_contains($description, 'Invoice '))
            ->values()
            ->all();
    }

    // ── Email ───────────────────────────────────────────────────────────────

    public function test_an_emailed_receipt_is_recorded_as_sent_only_after_the_send_returns(): void
    {
        Mail::fake();

        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-EM-1',
            'contact_email' => 'buyer@example.com',
        ]);

        (new SendTransactionReceiptMailJob($transaction, 'id', 'buyer@example.com'))->handle();

        $log = InvoiceDeliveryLog::sole();
        $this->assertSame(InvoiceDeliveryLog::CHANNEL_EMAIL, $log->channel);
        $this->assertSame(InvoiceDeliveryLog::STATUS_SENT, $log->status);
        $this->assertSame('buyer@example.com', $log->recipient);
        $this->assertSame($transaction->id, $log->transaction_id);
        $this->assertFalse($log->is_resend);
    }

    public function test_a_mailable_is_no_longer_queued_by_itself_so_the_job_can_report_truthfully(): void
    {
        $this->assertFalse(
            new TransactionReceiptMail(Transaction::factory()->create(), 'id') instanceof ShouldQueue,
            'A ShouldQueue mailable would make SendTransactionReceiptMailJob report success before the transport was reached.'
        );
    }

    public function test_an_exhausted_email_send_is_recorded_as_failed_with_the_reason(): void
    {
        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-EM-2',
            'contact_email' => 'buyer@example.com',
        ]);

        (new SendTransactionReceiptMailJob($transaction, 'id', 'buyer@example.com'))
            ->failed(new RuntimeException('smtp refused'));

        $log = InvoiceDeliveryLog::sole();
        $this->assertSame(InvoiceDeliveryLog::STATUS_FAILED, $log->status);
        $this->assertSame('smtp refused', $log->reason);
    }

    public function test_a_buyer_with_no_email_is_recorded_as_skipped_rather_than_silent(): void
    {
        Mail::fake();
        Bus::fake([SendTransactionReceiptMailJob::class, SendTransactionWhatsAppJob::class]);

        $transaction = Transaction::factory()->create([
            'user_id' => null,
            'contact_email' => null,
            'guest_contact' => null,
            'receipt_sent_at' => null,
        ]);

        app(SendTransactionReceiptAction::class)->execute($transaction);

        $log = InvoiceDeliveryLog::where('channel', InvoiceDeliveryLog::CHANNEL_EMAIL)->sole();
        $this->assertSame(InvoiceDeliveryLog::STATUS_SKIPPED, $log->status);
        $this->assertSame('Pembeli tidak punya alamat email', $log->reason);
        $this->assertNull($log->recipient);
    }

    // ── WhatsApp ────────────────────────────────────────────────────────────

    public function test_a_delivered_whatsapp_receipt_is_recorded_as_sent(): void
    {
        $this->configurePiwapi();
        Http::fake([
            'https://piwapi.test/*' => Http::response(['status' => 200], 200),
            'https://discord.test/*' => Http::response([], 204),
        ]);

        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-WA-1',
            'user_id' => null,
            'guest_contact' => '081234567890',
        ]);

        (new SendTransactionWhatsAppJob($transaction, 'id'))->handle(app(PiWapiService::class));

        $log = InvoiceDeliveryLog::where('channel', InvoiceDeliveryLog::CHANNEL_WHATSAPP)->sole();
        $this->assertSame(InvoiceDeliveryLog::STATUS_SENT, $log->status);

        $messages = $this->invoiceMessages();
        $this->assertCount(1, $messages);
        $this->assertStringContainsString('INV-WA-1', $messages[0]);
    }

    public function test_whatsapp_switched_off_is_recorded_as_skipped_and_never_reaches_discord(): void
    {
        $this->configurePiwapi();
        config(['services.piwapi.enabled' => false]);

        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-WA-2',
            'user_id' => null,
            'guest_contact' => '081234567890',
        ]);

        (new SendTransactionWhatsAppJob($transaction, 'id'))->handle(app(PiWapiService::class));

        $log = InvoiceDeliveryLog::where('channel', InvoiceDeliveryLog::CHANNEL_WHATSAPP)->sole();
        $this->assertSame(InvoiceDeliveryLog::STATUS_SKIPPED, $log->status);

        // Routine: it happens on every order while the gateway is off. A row, not
        // an alarm.
        $this->assertSame([], $this->invoiceMessages());
    }

    public function test_a_failed_whatsapp_send_raises_exactly_one_discord_alert(): void
    {
        $this->configurePiwapi();

        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-WA-3',
            'user_id' => null,
            'guest_contact' => '081234567890',
        ]);

        (new SendTransactionWhatsAppJob($transaction, 'id'))->failed(new RuntimeException('gateway 500'));

        $this->assertSame(InvoiceDeliveryLog::STATUS_FAILED, InvoiceDeliveryLog::sole()->status);

        $messages = $this->invoiceMessages();
        $this->assertCount(1, $messages, 'The job and the log action must not both report the same failure.');
        $this->assertStringContainsString('GAGAL', $messages[0]);
    }

    public function test_the_discord_policy_can_be_reduced_to_failures_only(): void
    {
        Mail::fake();
        config(['services.discord.invoice_log' => 'failures']);

        $transaction = Transaction::factory()->create([
            'invoice_number' => 'INV-POL-1',
            'contact_email' => 'buyer@example.com',
        ]);

        (new SendTransactionReceiptMailJob($transaction, 'id', 'buyer@example.com'))->handle();

        $this->assertSame(InvoiceDeliveryLog::STATUS_SENT, InvoiceDeliveryLog::sole()->status);
        $this->assertSame([], $this->invoiceMessages());
    }

    // ── The admin read ──────────────────────────────────────────────────────

    public function test_the_trail_requires_authentication(): void
    {
        $this->getJson('/api/v1/invoice-logs')->assertUnauthorized();
    }

    public function test_the_trail_lists_attempts_newest_first_and_filters_by_outcome_and_invoice(): void
    {
        $this->actingAsAdmin();

        $transaction = Transaction::factory()->create(['invoice_number' => 'INV-LOG-1']);
        $other = Transaction::factory()->create(['invoice_number' => 'INV-LOG-2']);

        InvoiceDeliveryLog::create([
            'transaction_id' => $transaction->id,
            'channel' => InvoiceDeliveryLog::CHANNEL_EMAIL,
            'recipient' => 'buyer@example.com',
            'status' => InvoiceDeliveryLog::STATUS_FAILED,
            'reason' => 'smtp refused',
            'attempted_at' => now()->subMinutes(5),
        ]);
        InvoiceDeliveryLog::create([
            'transaction_id' => $other->id,
            'channel' => InvoiceDeliveryLog::CHANNEL_WHATSAPP,
            'recipient' => '6281234567890',
            'status' => InvoiceDeliveryLog::STATUS_SENT,
            'attempted_at' => now(),
        ]);

        $this->getJson('/api/v1/invoice-logs')
            ->assertOk()
            ->assertJsonCount(2, 'data.data')
            // Newest first: the WhatsApp send happened a moment later.
            ->assertJsonPath('data.data.0.invoice_number', 'INV-LOG-2')
            ->assertJsonPath('data.data.1.status', 'failed');

        $this->getJson('/api/v1/invoice-logs?status=failed')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', 'INV-LOG-1')
            ->assertJsonPath('data.data.0.reason', 'smtp refused');

        $this->getJson('/api/v1/invoice-logs?channel=whatsapp')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.status', 'sent');

        $this->getJson('/api/v1/invoice-logs?search=INV-LOG-1')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.invoice_number', 'INV-LOG-1');
    }
}
