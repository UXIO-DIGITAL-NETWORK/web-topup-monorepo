<?php

namespace Tests\Feature\Storefront;

use App\Enums\PriceChangeLogSource;
use App\Enums\PriceChangeLogStatus;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Services\UxiolabsService;
use App\Support\Uxiolabs\PriceCheckLock;
use App\Support\Uxiolabs\PriceListSync;
use App\Support\Uxiolabs\UxiolabsSupplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The checkout screen's price/availability question.
 *
 * What matters here is not only the four answers, but that asking them cannot
 * hurt the sale: the check never throws, never blocks a buyer over a provider
 * hiccup, never fetches more than the refresh window allows, and writes the same
 * rows the 5-minute sweep would have written — under the same lock.
 */
class CheckoutRecheckTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $uxiolabs;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.uxiolabs.api_key' => 'test-api-key']);

        $this->uxiolabs = Supplier::factory()->create(['name' => UxiolabsSupplier::NAME]);
    }

    private function fakePriceList(array $items): void
    {
        Http::fake(['*/service' => Http::response([
            'status' => true,
            'msg' => 'Berhasil Mendapatkan Data Layanan',
            'data' => $items,
        ])]);
    }

    private function serviceItem(array $overrides = []): array
    {
        return array_merge([
            'id' => 'ML5',
            'nama_layanan' => 'Mobile Legends 5 Diamond',
            'kategori' => 'Mobile Legends',
            'harga' => 10000,
            'harga_gold' => 9800,
            'harga_silver' => 9900,
            'harga_pro' => 9700,
            'status' => 'aktif',
        ], $overrides);
    }

    /** A live, priced mapping — the default subject of these tests. */
    private function seedMapping(int $cost = 10000): SupplierProduct
    {
        $product = Product::factory()->create([
            'code' => 'ML5',
            'price_member' => 12000,
            'price_vip' => 11500,
            'price_reseller' => 11000,
            'price_agent' => 10500,
        ]);

        return SupplierProduct::factory()->for($product)->for($this->uxiolabs)->create([
            'buyer_sku_code' => 'ML5',
            'price' => $cost,
            'is_active' => true,
            'provider_name' => 'Mobile Legends 5 Diamond',
        ]);
    }

    private function recheck(SupplierProduct $mapping)
    {
        return $this->postJson('/api/v1/storefront/checkout/recheck', [
            'product_id' => $mapping->product_id,
        ]);
    }

    public function test_it_asks_for_a_real_product(): void
    {
        $this->postJson('/api/v1/storefront/checkout/recheck', [])
            ->assertStatus(422)
            ->assertJsonPath('status', 'fail');

        $this->postJson('/api/v1/storefront/checkout/recheck', ['product_id' => 999])
            ->assertStatus(422);
    }

    public function test_nothing_moved_is_ok_and_writes_nothing(): void
    {
        $mapping = $this->seedMapping();
        $this->fakePriceList([$this->serviceItem()]);

        $this->recheck($mapping)
            ->assertOk()
            ->assertJsonPath('data.outcome', 'ok')
            ->assertJsonPath('data.available', true)
            ->assertJsonPath('data.freshness', 'fresh');

        // Nothing changed, so there is nothing to record and nothing to rewrite.
        $this->assertDatabaseCount('price_change_logs', 0);
    }

    public function test_a_cost_rise_reprices_immediately_and_is_logged_as_a_checkout_change(): void
    {
        $mapping = $this->seedMapping(10000);
        $before = (int) $mapping->product->price_member;

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $response = $this->recheck($mapping)->assertOk();

        $response
            ->assertJsonPath('data.outcome', 'price_changed')
            ->assertJsonPath('data.previous_price', $before);

        $quoted = (int) $response->json('data.price');
        $this->assertGreaterThan($before, $quoted);

        // The price the buyer is shown is the price that was stored — that is the
        // whole point of writing here instead of only reporting.
        $this->assertSame((int) $mapping->product->fresh()->price_member, $quoted);

        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::APPLIED->value,
            'source' => PriceChangeLogSource::CHECKOUT->value,
            'old_cost' => 10000,
            'new_cost' => 12000,
        ]);
    }

    public function test_an_item_switched_off_makes_it_unavailable_and_deactivates_the_mapping(): void
    {
        $mapping = $this->seedMapping();
        $this->fakePriceList([$this->serviceItem(['status' => 'nonaktif'])]);

        $this->recheck($mapping)
            ->assertOk()
            ->assertJsonPath('data.outcome', 'unavailable')
            ->assertJsonPath('data.available', false);

        $fresh = $mapping->fresh();
        $this->assertFalse((bool) $fresh->is_active);
        $this->assertNotNull($fresh->sync_deactivated_at);

        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::DEACTIVATED->value,
            'source' => PriceChangeLogSource::CHECKOUT->value,
        ]);
    }

    public function test_a_mapping_deactivated_by_hand_is_never_revived(): void
    {
        // `sync_deactivated_at` null means an admin turned it off, not the checker —
        // and an admin's decision is not this path's to reverse.
        $mapping = $this->seedMapping();
        $mapping->forceFill(['is_active' => false, 'sync_deactivated_at' => null])->save();

        $this->fakePriceList([$this->serviceItem()]);

        $this->recheck($mapping)
            ->assertOk()
            ->assertJsonPath('data.outcome', 'unavailable');

        $fresh = $mapping->fresh();
        $this->assertFalse((bool) $fresh->is_active);
        $this->assertNull($fresh->sync_deactivated_at);
    }

    public function test_buyers_picking_packages_seconds_apart_share_one_upstream_call(): void
    {
        $mapping = $this->seedMapping();
        $this->fakePriceList([$this->serviceItem()]);

        $this->recheck($mapping)->assertOk();
        $this->recheck($mapping)->assertOk();

        Http::assertSentCount(1);
    }

    public function test_it_reads_the_sweeps_snapshot_instead_of_fetching_while_a_run_holds_the_lock(): void
    {
        $mapping = $this->seedMapping();
        Http::fake();

        $service = app(UxiolabsService::class);

        // The sweep is mid-run: it holds the lock and has already written the
        // snapshot it fetched. A second fetch here would be a second writer's view
        // of the same catalogue.
        $held = Cache::lock(PriceCheckLock::KEY, PriceCheckLock::SECONDS);
        $this->assertTrue($held->get());
        Cache::put($service->priceListCacheKey(), [$this->serviceItem()], $service->priceListCacheTtl());

        try {
            $this->recheck($mapping)
                ->assertOk()
                ->assertJsonPath('data.outcome', 'ok')
                ->assertJsonPath('data.freshness', 'sweep');
        } finally {
            $held->release();
        }

        Http::assertNothingSent();
    }

    public function test_stale_data_with_an_unreachable_provider_answers_unknown(): void
    {
        $mapping = $this->seedMapping();
        $this->assertNull(PriceListSync::lastSyncedAt());

        Http::fake(['*/service' => Http::response([], 500)]);

        $this->recheck($mapping)
            ->assertOk()
            ->assertJsonPath('data.outcome', 'unknown');

        // We could not look, so nothing was written or claimed.
        $this->assertDatabaseCount('price_change_logs', 0);
    }

    public function test_fresh_data_passes_the_buyer_through_when_the_provider_is_unreachable(): void
    {
        $mapping = $this->seedMapping();

        // A sync landed moments ago: the stored price is still an answer, so a
        // failed call must not close the shop.
        PriceListSync::markFetched();

        Http::fake(['*/service' => Http::response([], 500)]);

        $this->recheck($mapping)
            ->assertOk()
            ->assertJsonPath('data.outcome', 'ok');
    }
}
