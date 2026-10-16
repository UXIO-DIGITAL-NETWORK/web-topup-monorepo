<?php

namespace Tests\Feature\Uxiolabs;

use App\Models\PriceChangeLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PriceChangeLogsTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): void
    {
        $role = Role::factory()->create(['name' => 'Admin']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/v1/uxiolabs/price-change-logs')->assertUnauthorized();
    }

    public function test_requires_admin(): void
    {
        $role = Role::factory()->create(['name' => 'Member']);
        Sanctum::actingAs(User::factory()->create(['role_id' => $role->id]), ['access-api']);

        $this->getJson('/api/v1/uxiolabs/price-change-logs')->assertForbidden();
    }

    public function test_paginates_and_returns_the_expected_shape(): void
    {
        $this->actingAsAdmin();
        PriceChangeLog::factory()->count(3)->create();

        $response = $this->getJson('/api/v1/uxiolabs/price-change-logs')->assertOk();

        $response->assertJsonCount(3, 'data.data');
        $response->assertJsonPath('data.meta.total', 3);
        $response->assertJsonStructure([
            'data' => [
                'data' => [[
                    'id', 'supplier_product_id', 'product_id', 'buyer_sku_code',
                    'product_name', 'status', 'source', 'needs_attention', 'reason',
                    'old_cost', 'new_cost',
                    'prices' => [
                        'member' => ['old', 'new'],
                        'vip' => ['old', 'new'],
                        'reseller' => ['old', 'new'],
                        'agent' => ['old', 'new'],
                    ],
                    'created_at',
                ]],
                'links',
                'meta',
            ],
        ]);
    }

    public function test_needs_attention_flag_reflects_the_status(): void
    {
        $this->actingAsAdmin();
        PriceChangeLog::factory()->applied()->create();
        PriceChangeLog::factory()->deactivated()->create();

        $response = $this->getJson('/api/v1/uxiolabs/price-change-logs?status=all')->assertOk();

        $byStatus = collect($response->json('data.data'))->keyBy('status');
        $this->assertFalse($byStatus['applied']['needs_attention']);
        $this->assertTrue($byStatus['deactivated']['needs_attention']);
    }

    public function test_filters_by_status(): void
    {
        $this->actingAsAdmin();
        PriceChangeLog::factory()->applied()->create();
        PriceChangeLog::factory()->locked()->create();
        PriceChangeLog::factory()->negativeMargin()->create();

        $this->getJson('/api/v1/uxiolabs/price-change-logs?status=locked')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.status', 'locked');

        $this->getJson('/api/v1/uxiolabs/price-change-logs?status=all')
            ->assertOk()
            ->assertJsonCount(3, 'data.data');
    }

    public function test_filters_by_date_range(): void
    {
        $this->actingAsAdmin();
        PriceChangeLog::factory()->create(['created_at' => '2026-08-01 10:00:00']);
        PriceChangeLog::factory()->create(['created_at' => '2026-08-20 10:00:00']);

        $this->getJson('/api/v1/uxiolabs/price-change-logs?date_from=2026-08-15&date_to=2026-08-25')
            ->assertOk()
            ->assertJsonCount(1, 'data.data');
    }

    public function test_searches_by_product_name_or_sku(): void
    {
        $this->actingAsAdmin();
        PriceChangeLog::factory()->create(['product_name' => 'Mobile Legends 5 Diamond', 'buyer_sku_code' => 'ML5']);
        PriceChangeLog::factory()->create(['product_name' => 'Free Fire 100', 'buyer_sku_code' => 'FF100']);

        $this->getJson('/api/v1/uxiolabs/price-change-logs?search=Legends')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.buyer_sku_code', 'ML5');

        $this->getJson('/api/v1/uxiolabs/price-change-logs?search=FF100')
            ->assertOk()
            ->assertJsonCount(1, 'data.data');
    }

    public function test_orders_newest_first(): void
    {
        $this->actingAsAdmin();
        $older = PriceChangeLog::factory()->create(['created_at' => '2026-08-01 10:00:00']);
        $newer = PriceChangeLog::factory()->create(['created_at' => '2026-08-20 10:00:00']);

        $this->getJson('/api/v1/uxiolabs/price-change-logs')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $newer->id)
            ->assertJsonPath('data.data.1.id', $older->id);
    }

    public function test_the_old_price_alert_endpoints_are_gone(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/v1/uxiolabs/price-alerts')->assertNotFound();
        $this->postJson('/api/v1/uxiolabs/price-alerts/acknowledge-all')->assertNotFound();
        $this->postJson('/api/v1/uxiolabs/price-alerts/1/acknowledge')->assertNotFound();
    }
}
