<?php

namespace Tests\Feature\Uxiolabs;

use App\Actions\Pricing\WriteProductPricesAction;
use App\Actions\Uxiolabs\CheckUxiolabsPricesAction;
use App\Enums\PriceChangeLogStatus;
use App\Models\ActivityLog;
use App\Models\FlashSale;
use App\Models\FlashSaleItem;
use App\Models\MembershipPlan;
use App\Models\PricingRule;
use App\Models\Product;
use App\Models\ProductPlanPrice;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\SupplierProduct;
use App\Services\PricingService;
use App\Services\ProductRepricer;
use App\Support\Membership\DefaultPlan;
use App\Support\Uxiolabs\UxiolabsSupplier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Mockery\MockInterface;
use RuntimeException;
use Tests\TestCase;

class CheckUxiolabsPricesTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $uxiolabs;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.uxiolabs.api_key' => 'test-api-key']);

        // Seeded under the name the pipeline resolves TODAY (a constant, not a
        // literal) — so a rename that missed a lookup fails here instead of only
        // in production.
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
    private function seedMapping(int $cost = 10000, array $productOverrides = []): SupplierProduct
    {
        $product = Product::factory()->create(array_merge([
            'code' => 'ML5',
            'price_member' => 12000,
            'price_vip' => 11500,
            'price_reseller' => 11000,
            'price_agent' => 10500,
        ], $productOverrides));

        return SupplierProduct::factory()->for($product)->for($this->uxiolabs)->create([
            'buyer_sku_code' => 'ML5',
            'price' => $cost,
            'is_active' => true,
        ]);
    }

    public function test_unknown_service_creates_nothing_and_is_counted(): void
    {
        $this->fakePriceList([$this->serviceItem(['id' => 'BRAND_NEW'])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->unknownCount);
        $this->assertSame(['BRAND_NEW'], $report->unknownSkusSample);
        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('supplier_products', 0);
        $this->assertDatabaseCount('price_change_logs', 0);
    }

    public function test_cost_rise_reprices_all_four_tiers_and_logs_applied(): void
    {
        $mapping = $this->seedMapping(10000);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->priceChangedCount);
        $this->assertSame(1, $report->repricedCount);

        // Cost is factual — updated automatically.
        $this->assertDatabaseHas('supplier_products', ['buyer_sku_code' => 'ML5', 'price' => 12000]);

        // All four tiers now follow the margin rules, and price_modal follows cost.
        // Compare against an independent PricingService run so this asserts the
        // wiring, not a hand-computed number vulnerable to float rounding.
        $product = $mapping->product->fresh();
        $expected = $this->expectedPrices($product, 12000);
        $this->assertSame($expected['price_member'], (int) $product->price_member);
        $this->assertSame($expected['price_vip'], (int) $product->price_vip);
        $this->assertSame($expected['price_reseller'], (int) $product->price_reseller);
        $this->assertSame($expected['price_agent'], (int) $product->price_agent);
        $this->assertSame(12000, (int) $product->price_modal);
        // The tiers genuinely moved up from the 10000-cost seed.
        $this->assertGreaterThan(12000, (int) $product->price_member);

        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'buyer_sku_code' => 'ML5',
            'status' => PriceChangeLogStatus::APPLIED->value,
            'old_cost' => 10000,
            'new_cost' => 12000,
            'old_price_member' => 12000,
            'new_price_member' => $expected['price_member'],
        ]);
    }

    /** The same computation the checker delegates to — used to avoid float-artifact literals. */
    private function expectedPrices(Product $product, int $cost, array $overrides = []): array
    {
        return app(PricingService::class)->computePrices(
            $cost,
            $product->category_id,
            $overrides,
            $product->price_min,
            $product->price_max,
        );
    }

    /**
     * A repriced figure has to land where customers are charged from.
     *
     * The checker used to move `products.price_member` and leave
     * `product_plan_prices` alone, so a cost rise was logged as applied — "Harga
     * jual diperbarui otomatis" — while `PlanPrice` kept quoting the old price.
     * The drift it left behind is what failed the deploy's verify gate.
     */
    public function test_a_cost_rise_writes_the_plan_row_customers_are_billed_from(): void
    {
        $mapping = $this->seedMapping(10000);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        $product = $mapping->product->fresh();

        // ceil(12000 × 1.2) — the same figure the change log reports.
        $this->assertSame(14400, (int) $product->price_member);
        $this->assertSame(14400, (int) ProductPlanPrice::where('product_id', $product->id)
            ->where('membership_plan_id', DefaultPlan::id())->value('price'));

        // And the gate that failed in production has nothing left to complain about.
        $this->artisan('pricing:verify')->assertSuccessful();
    }

    public function test_mapping_margin_override_wins_over_the_rules(): void
    {
        $mapping = $this->seedMapping(10000);
        $mapping->update(['margin_member' => 50]); // 50% override for member only

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        $product = $mapping->product->fresh();
        $this->assertSame(18000, (int) $product->price_member); // 12000 * 1.5 (override)
        // No plan grants VIP in this database, so the legacy column mirrors the
        // default tier rather than inventing a price for a tier nobody sells.
        $this->assertSame(18000, (int) $product->price_vip);
    }

    public function test_price_max_clamps_the_repriced_values(): void
    {
        $mapping = $this->seedMapping(10000, ['price_max' => 13000]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->repricedCount);
        $product = $mapping->product->fresh();
        // Member would exceed 13000 → clamped to it; agent stays under the ceiling.
        $this->assertSame(13000, (int) $product->price_member);
        $this->assertSame($this->expectedPrices($product, 12000)['price_agent'], (int) $product->price_agent);
    }

    public function test_a_product_flagged_locked_is_still_repriced_from_the_margin_rules(): void
    {
        // The lock used to freeze the selling price here: the cost rose, the price
        // stayed put, and checkout then refused the customer with "harga modal
        // supplier sedang naik". The margin rule now always wins.
        $mapping = $this->seedMapping(10000, ['is_price_locked' => true, 'price_member' => 12000]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->repricedCount);
        $this->assertSame(0, $report->negativeMarginCount);

        $product = $mapping->product->fresh();
        $this->assertSame($this->expectedPrices($product, 12000)['price_member'], (int) $product->price_member);
        $this->assertGreaterThan(12000, (int) $product->price_member);

        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::APPLIED->value,
            'old_cost' => 10000,
            'new_cost' => 12000,
        ]);
        $this->assertDatabaseMissing('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::LOCKED->value,
        ]);
    }

    public function test_a_sku_deactivated_at_the_provider_is_logged_as_needs_attention(): void
    {
        $mapping = $this->seedMapping();

        $this->fakePriceList([$this->serviceItem(['status' => 'nonaktif'])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->deactivatedLoggedCount);
        $this->assertFalse((bool) $mapping->fresh()->is_active);
        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::DEACTIVATED->value,
        ]);
    }

    public function test_a_clamp_that_forces_price_below_cost_logs_negative_margin(): void
    {
        // price_max below the new cost means even the clamped price is under cost.
        $mapping = $this->seedMapping(10000, ['price_max' => 11000]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->negativeMarginCount);
        $this->assertSame(0, $report->repricedCount);

        $product = $mapping->product->fresh();
        $this->assertSame(11000, (int) $product->price_member); // still applied (clamped)
        $this->assertLessThan(12000, (int) $product->price_member);

        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::NEGATIVE_MARGIN->value,
        ]);
    }

    public function test_a_pooled_row_is_never_repriced_or_logged(): void
    {
        $mapping = SupplierProduct::factory()->for($this->uxiolabs)->create([
            'product_id' => null,
            'buyer_sku_code' => 'ML5',
            'price' => 10000,
            'is_active' => true,
        ]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        // Cost still updates; nothing to reprice or log.
        $this->assertSame(12000, (int) $mapping->fresh()->price);
        $this->assertDatabaseCount('price_change_logs', 0);
    }

    public function test_an_inactive_mapped_product_is_not_repriced(): void
    {
        $product = Product::factory()->create(['code' => 'ML5', 'price_member' => 12000]);
        $mapping = SupplierProduct::factory()->for($product)->for($this->uxiolabs)->create([
            'buyer_sku_code' => 'ML5',
            'price' => 10000,
            'is_active' => false,
            'sync_deactivated_at' => null, // admin turned it off, not the checker
        ]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(0, $report->repricedCount);
        $this->assertDatabaseCount('price_change_logs', 0);
        $this->assertSame(12000, (int) $mapping->product->fresh()->price_member); // untouched
    }

    public function test_unchanged_cost_writes_no_log(): void
    {
        $this->seedMapping(10000);

        $this->fakePriceList([$this->serviceItem(['harga' => 10000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(0, $report->priceChangedCount);
        $this->assertDatabaseCount('price_change_logs', 0);
    }

    public function test_a_cost_revert_creates_a_second_applied_log_not_a_dedupe(): void
    {
        $mapping = $this->seedMapping(10000);

        Http::fake([
            '*/service' => Http::sequence()
                ->push(['status' => true, 'msg' => 'ok', 'data' => [$this->serviceItem(['harga' => 12000])]])
                ->push(['status' => true, 'msg' => 'ok', 'data' => [$this->serviceItem(['harga' => 10000])]]),
        ]);

        app(CheckUxiolabsPricesAction::class)->execute();
        app(CheckUxiolabsPricesAction::class)->execute();

        // Append-only: two movements, two rows.
        $this->assertDatabaseCount('price_change_logs', 2);
        // Prices are back to the 10000-derived values.
        $this->assertSame(12000, (int) $mapping->product->fresh()->price_member);
    }

    public function test_only_the_uxiolabs_suppliers_mappings_are_touched(): void
    {
        $other = Supplier::factory()->create(['name' => 'Other']);
        $otherProduct = Product::factory()->create(['code' => 'OTHER']);
        $otherMapping = SupplierProduct::factory()->for($otherProduct)->for($other)->create([
            'buyer_sku_code' => 'ML5',
            'price' => 10000,
            'is_active' => true,
        ]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(10000, (int) $otherMapping->fresh()->price);
        $this->assertDatabaseCount('price_change_logs', 0);
    }

    public function test_configured_price_tier_is_used_as_cost(): void
    {
        config(['services.uxiolabs.price_tier' => 'harga_gold']);

        $this->seedMapping(10000);
        $this->fakePriceList([$this->serviceItem(['harga' => 10000, 'harga_gold' => 9500])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertDatabaseHas('supplier_products', ['buyer_sku_code' => 'ML5', 'price' => 9500]);
    }

    public function test_nonaktif_service_is_deactivated_and_reactivated_only_by_checker(): void
    {
        $mapping = $this->seedMapping();

        Http::fake([
            '*/service' => Http::sequence()
                ->push(['status' => true, 'msg' => 'ok', 'data' => [$this->serviceItem(['status' => 'nonaktif'])]])
                ->push(['status' => true, 'msg' => 'ok', 'data' => [$this->serviceItem()]]),
        ]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $mapping->refresh();
        $this->assertSame(['ML5'], $report->deactivated);
        $this->assertFalse((bool) $mapping->is_active);
        $this->assertNotNull($mapping->sync_deactivated_at);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $mapping->refresh();
        $this->assertSame(['ML5'], $report->reactivated);
        $this->assertTrue((bool) $mapping->is_active);
        $this->assertNull($mapping->sync_deactivated_at);
    }

    public function test_manually_deactivated_mapping_is_never_reactivated(): void
    {
        $product = Product::factory()->create(['code' => 'ML5']);
        $mapping = SupplierProduct::factory()->for($product)->for($this->uxiolabs)->create([
            'buyer_sku_code' => 'ML5',
            'price' => 10000,
            'is_active' => false,
            'sync_deactivated_at' => null, // admin turned it off, not the checker
        ]);

        $this->fakePriceList([$this->serviceItem()]);
        app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertFalse((bool) $mapping->fresh()->is_active);
    }

    public function test_a_rising_cost_never_leaves_a_product_in_the_negative_margin_scan(): void
    {
        // The scan is the cross-check that feeds the Discord report. An automatic
        // reprice can no longer produce a row in it — only a `price_max` ceiling
        // or a hand-typed plan price can, and both are covered above.
        $mapping = $this->seedMapping(10000, ['is_price_locked' => true, 'price_member' => 12000]);

        $this->fakePriceList([$this->serviceItem(['harga' => 15000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame([], $report->negativeMargin);
        $this->assertGreaterThanOrEqual(15000, (int) $mapping->product->fresh()->price_member);
    }

    public function test_error_envelope_is_rejected_not_treated_as_empty_list(): void
    {
        Http::fake(['*/service' => Http::response([
            'status' => false,
            'msg' => 'api_key tidak ditemukan',
            'data' => [],
        ])]);

        $this->expectExceptionMessage('api_key tidak ditemukan');

        app(CheckUxiolabsPricesAction::class)->execute();
    }

    /**
     * The scheduled tick reports to Discord on EVERY run — the operator's choice,
     * 288 messages a day — so the checker's log lives in the channel instead of
     * appearing only when the command crashes.
     */
    public function test_the_scheduled_run_reports_to_discord_every_time(): void
    {
        config(['services.discord.webhook_log_url' => 'https://discord.test/webhook']);

        $this->seedMapping();
        Http::fake([
            '*/service' => Http::response(['status' => true, 'msg' => 'ok', 'data' => [$this->serviceItem(['harga' => 11000])]]),
            'discord.test/*' => Http::response([]),
        ]);

        $this->artisan('uxiolabs:check-prices')->assertExitCode(0);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'discord.test'));
        Http::assertSent(fn ($request) => str_contains($request->body(), 'terjadwal'));
    }

    /** A tick that collided with another run is part of the log too. */
    public function test_a_skipped_tick_is_reported_rather_than_silent(): void
    {
        config(['services.discord.webhook_log_url' => 'https://discord.test/webhook']);

        Http::fake(['discord.test/*' => Http::response([])]);

        $held = Cache::lock('uxiolabs:price-check', 300);
        $this->assertTrue($held->get());

        try {
            $this->artisan('uxiolabs:check-prices')->assertExitCode(0);
        } finally {
            $held->release();
        }

        Http::assertSent(fn ($request) => str_contains($request->body(), 'Dilewati'));
    }

    public function test_sync_products_command_runs_and_reports_to_discord(): void
    {
        config(['services.discord.webhook_log_url' => 'https://discord.test/webhook']);

        $this->seedMapping();
        Http::fake([
            '*/service' => Http::response(['status' => true, 'msg' => 'ok', 'data' => [$this->serviceItem(['harga' => 11000])]]),
            'discord.test/*' => Http::response([]),
        ]);

        $this->artisan('uxiolabs:sync-products')->assertExitCode(0);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'discord.test'));
    }

    public function test_command_fails_when_uxiolabs_is_unreachable(): void
    {
        Http::fake(['*/service' => Http::response('server error', 500)]);

        $this->artisan('uxiolabs:check-prices')->assertExitCode(1);
    }

    public function test_pricing_rules_drive_the_repriced_values(): void
    {
        PricingRule::factory()->create(['category_id' => null, 'role' => 'member', 'markup_percent' => 30, 'markup_flat' => 0]);
        $mapping = $this->seedMapping(10000);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        $product = $mapping->product->fresh();
        // The 30% rule drives it, above the 20% built-in default (which would be 14400).
        $this->assertSame($this->expectedPrices($product, 12000)['price_member'], (int) $product->price_member);
        $this->assertGreaterThan(15000, (int) $product->price_member);
    }

    /**
     * The log states what happened, so it has to read the BILLED row — not the
     * number the repricer computed.
     *
     * A manual plan row is deliberately skipped by the write, and `PlanPrice`
     * bills it. Logging the computed figure would claim a VIP price that no VIP
     * customer is charged, while the legacy column and the log moved together and
     * only the billed row stood still.
     */
    public function test_the_log_records_the_price_actually_billed_not_the_computed_one(): void
    {
        $mapping = $this->seedMapping(10000);
        $product = $mapping->product;

        // A VIP tier that the admin priced by hand, well under the new cost.
        $vipPlan = $this->vipPlan();
        ProductPlanPrice::create([
            'product_id' => $product->id,
            'membership_plan_id' => $vipPlan->id,
            'price' => 5000,
            'is_manual' => true,
        ]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        app(CheckUxiolabsPricesAction::class)->execute();

        // The manual row is what a VIP is billed, so that is what the log says.
        $this->assertSame(5000, (int) ProductPlanPrice::where('product_id', $product->id)
            ->where('membership_plan_id', $vipPlan->id)->value('price'));
        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'new_price_vip' => 5000,
        ]);
    }

    /**
     * The margin guard runs per tier at checkout, so a tier under cost has to be
     * visible here even when the member price is healthy — otherwise it only ever
     * shows up as a refusal for whoever is on that tier.
     */
    public function test_a_non_default_tier_below_cost_is_surfaced_with_its_tier_name(): void
    {
        $mapping = $this->seedMapping(10000);
        $vipPlan = $this->vipPlan();
        ProductPlanPrice::create([
            'product_id' => $mapping->product->id,
            'membership_plan_id' => $vipPlan->id,
            'price' => 5000,
            'is_manual' => true,
        ]);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertContains('vip', array_column($report->negativeMargin, 'tier'));
        $this->assertSame(1, $report->negativeMarginCount);
    }

    /** A flash sale is the price `PlanPrice` returns while it runs, so it counts. */
    public function test_a_running_flash_sale_below_cost_is_surfaced(): void
    {
        $mapping = $this->seedMapping(10000);

        $sale = FlashSale::create([
            'name' => 'Flash',
            'starts_at' => now()->subHour(),
            'ends_at' => now()->addHour(),
            'is_active' => true,
        ]);
        FlashSaleItem::create([
            'flash_sale_id' => $sale->id,
            'product_id' => $mapping->product->id,
            'sale_price' => 5000,
            'stock_total' => 10,
        ]);

        $this->fakePriceList([$this->serviceItem()]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertContains('flash sale', array_column($report->negativeMargin, 'tier'));
    }

    /**
     * A cost change that moves no price is not an "applied" reprice.
     *
     * The status is derived from the prices read back after the write, so a
     * rounding coincidence, a price window or a preserved manual row lands as
     * `unchanged` — the log used to assert an update that never happened.
     */
    public function test_a_cost_change_that_moves_no_price_is_logged_as_unchanged(): void
    {
        $mapping = $this->seedMapping(10000);

        // Put the product where a 12000 cost would put it, then let the provider
        // report that cost: the reprice re-derives the same four numbers.
        app(WriteProductPricesAction::class)->fromCost($mapping->product, 12000, $mapping);

        $this->fakePriceList([$this->serviceItem(['harga' => 12000])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->unchangedCount);
        $this->assertSame(0, $report->repricedCount);
        $this->assertDatabaseHas('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::UNCHANGED->value,
        ]);
        $this->assertDatabaseMissing('price_change_logs', [
            'supplier_product_id' => $mapping->id,
            'status' => PriceChangeLogStatus::APPLIED->value,
        ]);
    }

    /**
     * One row that cannot be repriced costs that row only.
     *
     * Every reprice used to share the run's single transaction, so one bad row
     * rolled back every OTHER product's new price — leaving the catalogue priced
     * at the old cost, which is exactly what checkout refuses — with nothing in
     * the log to say so.
     */
    public function test_one_row_that_cannot_be_repriced_does_not_roll_back_the_others(): void
    {
        $good = $this->seedMapping(10000);
        $bad = $this->seedMappingForSku('ML172', 10000);

        $real = app(ProductRepricer::class);

        // `WriteProductPricesAction` is final, so the seam is the repricer it
        // injects: one SKU's margins fail to compute, the rest carry on.
        $this->mock(ProductRepricer::class, function (MockInterface $mock) use ($real, $bad) {
            $mock->shouldReceive('compute')
                ->andReturnUsing(fn (int $cost, Product $product, SupplierProduct $mapping) => $real->compute($cost, $product, $mapping));

            $mock->shouldReceive('computeForPlans')
                ->andReturnUsing(function (int $cost, Product $product, SupplierProduct $mapping) use ($real, $bad) {
                    if ($product->id === $bad->product_id) {
                        throw new RuntimeException('this row cannot be repriced');
                    }

                    return $real->computeForPlans($cost, $product, $mapping);
                });
        });

        $this->fakePriceList([
            $this->serviceItem(['harga' => 12000]),
            $this->serviceItem(['id' => 'ML172', 'harga' => 12000]),
        ]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->repricedCount);
        $this->assertSame(1, $report->failedCount);
        $this->assertSame(['ML172'], $report->failedSkusSample);

        // The healthy row is repriced and logged; the broken one is left alone and
        // has NO log row, because claiming a price we did not write is worse than
        // a gap.
        $this->assertSame(14400, (int) $good->product->fresh()->price_member);
        $this->assertSame(12000, (int) $bad->product->fresh()->price_member);
        $this->assertDatabaseHas('price_change_logs', ['supplier_product_id' => $good->id]);
        $this->assertDatabaseMissing('price_change_logs', ['supplier_product_id' => $bad->id]);
    }

    /**
     * One run at a time, whatever started it. The scheduled command carries
     * `withoutOverlapping`, but the manual console command and the HTTP endpoint
     * do not — two overlapping runs each wrote a log row for one real change.
     */
    public function test_a_run_is_skipped_while_another_holds_the_lock(): void
    {
        $held = Cache::lock('uxiolabs:price-check', 300);
        $this->assertTrue($held->get());

        try {
            $report = app(CheckUxiolabsPricesAction::class)->execute();

            $this->assertNotNull($report->skippedReason);
            $this->assertSame(0, $report->totalFetched);
            $this->assertDatabaseCount('price_change_logs', 0);
        } finally {
            $held->release();
        }
    }

    /**
     * Verifikasi kode provider: nama layanan yang bergeser dari snapshot tersimpan
     * dicatat sebagai log sistem (`activity_logs`, `is_system`) — cara "kode produk
     * uxiotopup berubah" terverifikasi tanpa pernah menyentuh buyer_sku_code itu sendiri.
     */
    public function test_a_drifted_provider_name_is_written_to_the_system_log(): void
    {
        Cache::flush(); // drift is reported once per distinct set, not once per process

        $mapping = $this->seedMapping();
        $mapping->update(['provider_name' => 'Mobile Legends 5 Diamond']);

        $this->fakePriceList([$this->serviceItem(['nama_layanan' => 'ML 5 Diamond (baru)'])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->providerNameChangedCount);
        $this->assertSame(0, $report->disappearedCount);

        $log = ActivityLog::query()->latest('id')->first();
        $this->assertNotNull($log);
        $this->assertTrue((bool) $log->is_system);
        $this->assertStringContainsString('Verifikasi kode provider', (string) $log->message);

        // Kode provider sendiri tidak pernah ditulis ulang.
        $this->assertSame('ML5', $mapping->fresh()->buyer_sku_code);
    }

    /** Mapping yang tak lagi muncul di price list dihitung sebagai sinyal kode/penawaran berubah. */
    public function test_a_mapping_missing_from_the_price_list_is_counted(): void
    {
        Cache::flush();

        $this->seedMapping(); // ML5
        $this->fakePriceList([$this->serviceItem(['id' => 'OTHER'])]);

        $report = app(CheckUxiolabsPricesAction::class)->execute();

        $this->assertSame(1, $report->disappearedCount);
        $this->assertSame(['ML5'], $report->disappearedSkusSample);
    }

    /** A second, role-linked tier — what `ProductRepricer` maps the legacy VIP column to. */
    private function vipPlan(): MembershipPlan
    {
        return MembershipPlan::create([
            'code' => 'vip',
            'name' => ['id' => 'VIP', 'en' => 'VIP'],
            'price' => 100000,
            'duration_days' => 30,
            'role_id' => Role::factory()->create(['name' => 'vip'])->id,
            'is_active' => true,
            'sort_order' => 10,
        ]);
    }

    /** The same live, priced mapping as `seedMapping`, under a different provider SKU. */
    private function seedMappingForSku(string $sku, int $cost = 10000, array $productOverrides = []): SupplierProduct
    {
        $product = Product::factory()->create(array_merge([
            'code' => $sku,
            'price_member' => 12000,
            'price_vip' => 11500,
            'price_reseller' => 11000,
            'price_agent' => 10500,
        ], $productOverrides));

        return SupplierProduct::factory()->for($product)->for($this->uxiolabs)->create([
            'buyer_sku_code' => $sku,
            'price' => $cost,
            'is_active' => true,
        ]);
    }
}
