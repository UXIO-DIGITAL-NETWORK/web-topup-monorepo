<?php

namespace App\Actions\Uxiolabs;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Pricing\WriteProductPricesAction;
use App\Contracts\SupplierGateway;
use App\DTOs\Log\CreateActivityLogDTO;
use App\DTOs\Uxiolabs\PriceCheckReportDTO;
use App\Enums\PriceChangeLogStatus;
use App\Models\FlashSale;
use App\Models\PriceChangeLog;
use App\Models\Product;
use App\Models\SupplierProduct;
use App\Models\SupplierSkuSighting;
use App\Support\Uxiolabs\UxiolabsSupplier;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Compare the uxiolabs price list against existing supplier_products.
 *
 *  - Supplier cost (the configured tier from /service) and availability are
 *    updated automatically — factual data from the supplier that the checkout
 *    margin guard depends on.
 *  - Selling prices of LIVE products are recomputed AUTOMATICALLY from the
 *    configured margin/pricing rules (via ProductRepricer) whenever cost moves.
 *    Nothing freezes a selling price: a stale one is what makes checkout refuse
 *    an order ("harga modal supplier sedang naik"), so the margin rule wins.
 *  - Every relevant event writes a row to price_change_logs (applied / unchanged /
 *    negative_margin / deactivated) — the admin's audit trail, which replaces the
 *    old manual price-alert acknowledge flow. A row's status and numbers are read
 *    back off what was actually written, so the log never claims a price nobody
 *    is charged.
 *  - One run at a time (a cache lock), one product at a time: a single row that
 *    cannot be repriced costs that row only, and is reported as failed rather
 *    than rolling the whole catalogue back onto its old cost.
 *  - Unknown service ids are NEVER auto-created — products are added manually
 *    via the admin site (single add or Excel import). They are only counted
 *    in the report.
 *  - Availability keeps the sync_deactivated_at semantics: only mappings this
 *    checker deactivated are ever auto-reactivated, so a manual admin
 *    deactivation is never overridden.
 *
 * Scheduled every 5 minutes; also behind the manual `uxiolabs:sync-products`
 * command and POST /v1/uxiolabs/sync-products.
 */
class CheckUxiolabsPricesAction
{
    private const UPSERT_CHUNK = 500;

    private const UNKNOWN_SAMPLE_LIMIT = 50;

    /** First N SKUs whose reprice failed, for the report — enough to start with, not a log dump. */
    private const FAILED_SAMPLE_LIMIT = 20;

    /** First N drifted provider names / vanished mappings kept for the report. */
    private const CODE_CHANGE_SAMPLE_LIMIT = 50;

    /**
     * One run at a time, whatever started it.
     *
     * The scheduled command carries `withoutOverlapping`, but the manual console
     * command and the HTTP endpoint do not. Two overlapping runs read the same
     * snapshot, both see the cost move, and each writes a log row for one real
     * change — doubling every count in the report and the audit trail with it.
     * A lock here is the one choke point all three go through.
     */
    private const RUN_LOCK_KEY = 'uxiolabs:price-check';

    /**
     * Last reported provider-code drift. A drifted name on an already-promoted
     * mapping is never written back over `provider_name` (that column is the
     * record of what the row was pooled as), so the same drift would otherwise be
     * re-reported on every 5-minute run. The signature makes it once per distinct
     * drift, not 288 times a day.
     */
    private const DRIFT_CACHE_KEY = 'uxiolabs:provider-code-drift';

    /** Past the worst case (an upstream fetch plus thousands of rows); a crashed run must not wedge the schedule. */
    private const RUN_LOCK_SECONDS = 300;

    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly CreateActivityLogAction $logAction,
        private readonly WriteProductPricesAction $writePrices,
    ) {}

    public function execute(): PriceCheckReportDTO
    {
        $lock = Cache::lock(self::RUN_LOCK_KEY, self::RUN_LOCK_SECONDS);

        if (! $lock->get()) {
            return PriceCheckReportDTO::skipped('Sinkronisasi harga lain sedang berjalan.');
        }

        try {
            return $this->run();
        } finally {
            $lock->release();
        }
    }

    private function run(): PriceCheckReportDTO
    {
        // HTTP fetch happens before any DB transaction is opened; warm the
        // shared cache so service preview / manual add / import reuse this list.
        $items = $this->uxiolabsService->getPriceList();
        Cache::put(
            $this->uxiolabsService->priceListCacheKey(),
            $items,
            $this->uxiolabsService->priceListCacheTtl()
        );

        $supplier = UxiolabsSupplier::modelOrFail();

        $report = DB::transaction(fn () => $this->check($supplier->id, $items));

        // Provider-code verification — the "kode produk uxiotopup berubah" check.
        // A drifted name on a promoted mapping is seen again every run, so only a
        // NEW drift set earns a log row (see DRIFT_CACHE_KEY).
        $codeChanged = $report->providerNameChangedCount > 0 || $report->disappearedCount > 0;
        $driftSignature = $codeChanged
            ? md5((string) json_encode([$report->providerNameChanges, $report->disappearedSkusSample]))
            : null;
        $codeChangedFresh = $codeChanged && Cache::get(self::DRIFT_CACHE_KEY) !== $driftSignature;

        if ($codeChangedFresh) {
            Cache::put(self::DRIFT_CACHE_KEY, $driftSignature, now()->addDay());
        }

        // 288 runs/day — only log when something actually changed.
        if ($report->priceChangedCount > 0 || $report->deactivated !== []
            || $report->reactivated !== [] || $codeChangedFresh) {
            $message = "Cek harga Uxiotopup: {$report->priceChangedCount} modal berubah — "
                ."{$report->repricedCount} di-reprice, {$report->unchangedCount} tetap, "
                ."{$report->failedCount} gagal, "
                ."{$report->negativeMarginCount} margin negatif, "
                ."{$report->deactivatedLoggedCount} nonaktif (perlu perhatian).";

            if ($codeChangedFresh) {
                $message .= " Verifikasi kode provider: {$report->providerNameChangedCount} nama layanan berubah, "
                    ."{$report->disappearedCount} SKU hilang dari price list.";
            }

            $this->logAction->execute(new CreateActivityLogDTO(
                userId: auth()->id(),
                ipAddress: request()?->ip() ?? '127.0.0.1',
                userAgent: request()?->userAgent() ?? 'System/Scheduler',
                message: $message,
                isSystem: true,
            ));
        }

        return $report;
    }

    /**
     * @param  array<int,array<string,mixed>>  $items
     */
    private function check(int $supplierId, array $items): PriceCheckReportDTO
    {
        $now = now();

        // with('product'): reprice needs the product's category, limits and
        // current selling prices — load them once instead of per row.
        $existingMappings = SupplierProduct::where('supplier_id', $supplierId)
            ->with('product')
            ->get()
            ->keyBy('buyer_sku_code');

        $this->recordSightings($supplierId, $items);

        $deactivated = [];
        $reactivated = [];
        $unknownCount = 0;
        $unknownSample = [];
        $priceChanged = 0;
        $repriced = 0;
        $unchangedCount = 0;
        $failedCount = 0;
        $failedSample = [];
        $negativeMarginCount = 0;
        $deactivatedLogged = 0;
        $upsertRows = [];
        $logRows = [];
        // Provider-code verification: which ids we saw this run, and where the
        // provider's own service name drifted from the snapshot we stored.
        $seenSkus = [];
        $providerNameChanged = 0;
        $providerNameChanges = [];

        foreach ($items as $item) {
            // buyer_sku_code stores the uxiolabs service id (`id` in /service).
            $sku = (string) ($item['id'] ?? '');
            if ($sku === '') {
                continue;
            }

            // Seen upstream this run — anything mapped but absent from this set
            // has disappeared from the provider list.
            $seenSkus[$sku] = true;

            $existing = $existingMappings->get($sku);

            if (! $existing) {
                // Manual-only product flow: never auto-create, just count.
                $unknownCount++;
                if (count($unknownSample) < self::UNKNOWN_SAMPLE_LIMIT) {
                    $unknownSample[] = $sku;
                }

                continue;
            }

            $cost = $this->uxiolabsService->costFor($item);
            $available = $this->uxiolabsService->isItemActive($item);

            // Verifikasi kode provider: nama layanan dianggap bagian dari identitas
            // yang datang dari provider. Bila bergeser dari snapshot tersimpan,
            // catat — inilah cara "kode produk uxiotopup berubah" terdeteksi, sebab
            // buyer_sku_code sendiri adalah kunci dan tak bisa dibandingkan lewat lookup.
            $liveName = trim((string) ($item['nama_layanan'] ?? ''));
            if ($liveName !== '' && (string) $existing->provider_name !== ''
                && $liveName !== (string) $existing->provider_name) {
                $providerNameChanged++;
                if (count($providerNameChanges) < self::CODE_CHANGE_SAMPLE_LIMIT) {
                    $providerNameChanges[] = [
                        'sku' => $sku,
                        'old_name' => (string) $existing->provider_name,
                        'new_name' => $liveName,
                    ];
                }
            }

            $costChanged = (int) $existing->price !== $cost;
            $wasActive = (bool) $existing->is_active;

            if ($available && ! $wasActive && $existing->sync_deactivated_at !== null) {
                // Only re-activate what this checker itself turned off.
                $isActive = true;
                $syncDeactivatedAt = null;
                $reactivated[] = $sku;
            } elseif (! $available && $wasActive) {
                $isActive = false;
                $syncDeactivatedAt = $now;
                $deactivated[] = $sku;
            } else {
                $isActive = $wasActive;
                $syncDeactivatedAt = $existing->sync_deactivated_at;
            }

            // uxiolabs has a single aktif/nonaktif flag — mirror it into both
            // status columns so the schema stays untouched.
            $statusChanged = $isActive !== $wasActive
                || (bool) $existing->buyer_product_status !== $available
                || (bool) $existing->seller_product_status !== $available;

            if ($costChanged) {
                $priceChanged++;
            }

            // Auto-reprice + audit log. Only mapped products have a selling price;
            // a pooled row (product_id null) has nothing to reprice or log — its
            // cost still updates below and its preview prices move with it.
            $product = $existing->product;

            // The legacy columns as they stand *before* anything below writes. The
            // log records what each tier was, and the reprice updates the row in
            // place, so reading them off the model afterwards would report the new
            // price as the old one.
            $oldPrices = $product?->only(['price_member', 'price_vip', 'price_reseller', 'price_agent']) ?? [];

            if ($existing->product_id !== null && $product !== null) {
                if (! $available && $wasActive) {
                    // Went dark at the provider this run — can't be sold until the
                    // admin handles it. Attention outranks a locked-price note, so
                    // this is the only row we write for the mapping this run.
                    $logRows[] = $this->makeLogRow(
                        PriceChangeLogStatus::DEACTIVATED, $existing, $product, $oldPrices,
                        (int) $existing->price, $cost, null,
                        'SKU dinonaktifkan di provider — perlu perhatian admin.', $now,
                    );
                    $deactivatedLogged++;
                } elseif ($costChanged && $isActive && $available) {
                    try {
                        // Always reprice. A selling price left behind at an old
                        // cost is the one thing that makes checkout refuse a
                        // paying customer, so the margin rule is never
                        // second-guessed here.
                        //
                        // Its own transaction (a savepoint inside this run's), so
                        // one row that cannot be repriced — a duplicate plan row,
                        // a lock wait — costs that row only. Without it the
                        // exception rolled back every other product's price and
                        // left the whole catalogue priced at the old cost, which
                        // is exactly what checkout refuses.
                        $newPrices = DB::transaction(
                            fn () => $this->writePrices->fromCost($product, $cost, $existing)
                        );

                        $belowCost = $this->tiersBelowCost($newPrices, $cost);
                        $moved = $this->tiersMoved($oldPrices, $newPrices);

                        // A log row states what happened, so the status is read off
                        // the prices that were actually written: "applied" for a
                        // real movement, "unchanged" when the rule and the price
                        // window produced the same number, and the margin case
                        // first because it is the one that stops a sale.
                        $status = match (true) {
                            $belowCost !== [] => PriceChangeLogStatus::NEGATIVE_MARGIN,
                            ! $moved => PriceChangeLogStatus::UNCHANGED,
                            default => PriceChangeLogStatus::APPLIED,
                        };

                        $logRows[] = $this->makeLogRow(
                            $status, $existing, $product, $oldPrices, (int) $existing->price, $cost, $newPrices,
                            match ($status) {
                                PriceChangeLogStatus::NEGATIVE_MARGIN => 'Setelah markup & clamp, harga '
                                    .implode('/', $belowCost).' masih di bawah modal.',
                                PriceChangeLogStatus::UNCHANGED => 'Modal berubah; harga jual tidak berubah (aturan margin dan batas harga menghasilkan angka yang sama).',
                                default => 'Harga jual diperbarui otomatis dari aturan margin.',
                            },
                            $now,
                        );

                        match ($status) {
                            PriceChangeLogStatus::NEGATIVE_MARGIN => $negativeMarginCount++,
                            PriceChangeLogStatus::UNCHANGED => $unchangedCount++,
                            default => $repriced++,
                        };
                    } catch (Throwable $e) {
                        // The cost still lands (it is a fact, and it is in the
                        // upsert below); the selling price is left where it was and
                        // NO log row is written for it — a log that claims a price
                        // we did not write is worse than a gap. The negative-margin
                        // scan picks the row up at the end of this run.
                        $failedCount++;
                        if (count($failedSample) < self::FAILED_SAMPLE_LIMIT) {
                            $failedSample[] = $sku;
                        }

                        Log::channel('uxiolabs')->error('uxiolabs:check-prices reprice failed for one SKU', [
                            'buyer_sku_code' => $sku,
                            'product_id' => $product->id,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            }

            // A pooled row renders from this snapshot (it has no product to read a
            // name from), so keep it in step with the provider. Once promoted, the
            // product owns the name and this is left as the record of what it was
            // pooled as.
            $providerName = $existing->product_id === null
                ? (string) ($item['nama_layanan'] ?? $existing->provider_name)
                : $existing->provider_name;

            $metaChanged = $providerName !== $existing->provider_name;

            // Nothing to write unless something actually moved. `$metaChanged` has to
            // be part of this test AND of the upsert column list below, or the
            // refresh silently never lands.
            if (! $costChanged && ! $statusChanged && ! $metaChanged) {
                continue;
            }

            $upsertRows[] = [
                'supplier_id' => $supplierId,
                'buyer_sku_code' => $sku,
                'product_id' => $existing->product_id,
                'pool_category_id' => $existing->pool_category_id,
                'provider_name' => $providerName,
                'price' => $cost,
                'admin_fee' => $existing->admin_fee,
                'commission' => $existing->commission,
                'buyer_product_status' => $available,
                'seller_product_status' => $available,
                'is_active' => $isActive,
                'sync_deactivated_at' => $syncDeactivatedAt,
                'created_at' => $existing->created_at,
                'updated_at' => $now,
            ];
        }

        // Mapping yang tidak lagi muncul di price list: sinyal kode/penawaran
        // provider berubah atau layanan ditarik. Dihitung dari himpunan id yang
        // benar-benar terlihat di run ini, bukan dari hitungan per baris.
        $disappeared = $existingMappings->keys()
            ->diff(array_keys($seenSkus))
            ->values()
            ->all();

        foreach (array_chunk($upsertRows, self::UPSERT_CHUNK) as $chunk) {
            SupplierProduct::upsert(
                $chunk,
                ['supplier_id', 'buyer_sku_code'],
                ['price', 'provider_name', 'admin_fee', 'commission', 'buyer_product_status', 'seller_product_status', 'is_active', 'sync_deactivated_at', 'updated_at']
            );
        }

        // Append-only: plain insert, chunked. insert() bypasses casts, so the rows
        // are already raw scalars with explicit timestamps.
        foreach (array_chunk($logRows, self::UPSERT_CHUNK) as $chunk) {
            PriceChangeLog::insert($chunk);
        }

        return new PriceCheckReportDTO(
            totalFetched: count($items),
            priceChangedCount: $priceChanged,
            repricedCount: $repriced,
            unchangedCount: $unchangedCount,
            failedCount: $failedCount,
            negativeMarginCount: $negativeMarginCount,
            deactivatedLoggedCount: $deactivatedLogged,
            deactivated: $deactivated,
            reactivated: $reactivated,
            negativeMargin: $this->scanNegativeMargins(),
            unknownCount: $unknownCount,
            unknownSkusSample: $unknownSample,
            failedSkusSample: $failedSample,
            providerNameChangedCount: $providerNameChanged,
            providerNameChanges: $providerNameChanges,
            disappearedCount: count($disappeared),
            disappearedSkusSample: array_slice($disappeared, 0, self::CODE_CHANGE_SAMPLE_LIMIT),
        );
    }

    /**
     * Whether any tier's billed price actually moved — the difference between a
     * reprice that changed something and one that re-derived the same number.
     *
     * @param  array<string,mixed>  $old  The legacy columns as they stood before this run's write
     * @param  array<string,int>  $new  What each tier is billed at now
     */
    private function tiersMoved(array $old, array $new): bool
    {
        foreach (['price_member', 'price_vip', 'price_reseller', 'price_agent'] as $tier) {
            if ((int) ($old[$tier] ?? 0) !== (int) ($new[$tier] ?? 0)) {
                return true;
            }
        }

        return false;
    }

    /**
     * The tiers now priced below cost, by name.
     *
     * Every tier, not just `price_member`: checkout applies the margin guard to
     * whichever tier the customer is on (`CheckoutAction`), so a VIP row under
     * cost refuses a VIP customer even when the member price is healthy.
     *
     * @param  array<string,int>  $new  What each tier is billed at
     * @return array<int,string> e.g. ['member', 'vip']
     */
    private function tiersBelowCost(array $new, int $cost): array
    {
        $below = [];

        foreach (['price_member', 'price_vip', 'price_reseller', 'price_agent'] as $tier) {
            if (isset($new[$tier]) && (int) $new[$tier] < $cost) {
                $below[] = str_replace('price_', '', $tier);
            }
        }

        return $below;
    }

    /**
     * One price_change_logs row as a raw array for bulk insert(). Old selling
     * prices are snapshotted off the product; new prices come from the freshly
     * computed set, or null for an event that does not reprice (deactivated).
     *
     * @param  array<string,mixed>  $oldPrices  The legacy columns as they were before this run's write
     * @param  array{price_modal:int,price_member:int,price_vip:int,price_reseller:int,price_agent:int}|null  $newPrices
     * @return array<string,mixed>
     */
    private function makeLogRow(
        PriceChangeLogStatus $status,
        SupplierProduct $mapping,
        Product $product,
        array $oldPrices,
        int $oldCost,
        int $newCost,
        ?array $newPrices,
        string $reason,
        Carbon $now,
    ): array {
        return [
            'supplier_product_id' => $mapping->id,
            'product_id' => $product->id,
            'buyer_sku_code' => $mapping->buyer_sku_code,
            'product_name' => $product->name,
            'status' => $status->value,
            'old_cost' => $oldCost,
            'new_cost' => $newCost,
            'old_price_member' => (int) ($oldPrices['price_member'] ?? $product->price_member),
            'new_price_member' => $newPrices['price_member'] ?? null,
            'old_price_vip' => (int) ($oldPrices['price_vip'] ?? $product->price_vip),
            'new_price_vip' => $newPrices['price_vip'] ?? null,
            'old_price_reseller' => (int) ($oldPrices['price_reseller'] ?? $product->price_reseller),
            'new_price_reseller' => $newPrices['price_reseller'] ?? null,
            'old_price_agent' => (int) ($oldPrices['price_agent'] ?? $product->price_agent),
            'new_price_agent' => $newPrices['price_agent'] ?? null,
            'reason' => $reason,
            'created_at' => $now,
            'updated_at' => $now,
        ];
    }

    /**
     * Stamps the first time each SKU was seen upstream, so the Add panel can tell
     * "the provider just added this" from "we have simply never pooled it".
     *
     * Steady state is one pluck and no writes: only SKUs we have never recorded are
     * inserted. On the very first run every SKU is unseen, so the whole catalogue is
     * backdated instead — otherwise the pipeline would open with thousands of rows
     * all flagged New, which is the same as flagging none.
     *
     * @param  array<int,array<string,mixed>>  $items
     */
    private function recordSightings(int $supplierId, array $items): void
    {
        $known = SupplierSkuSighting::where('supplier_id', $supplierId)
            ->pluck('buyer_sku_code')
            ->flip();

        $isFirstRun = $known->isEmpty();
        $seenAt = $isFirstRun
            ? now()->subDays(SupplierSkuSighting::NEW_FOR_DAYS + 1)
            : now();

        $rows = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $sku = (string) ($item['id'] ?? '');

            if ($sku === '' || $known->has($sku)) {
                continue;
            }

            $known->put($sku, true);

            $rows[] = [
                'supplier_id' => $supplierId,
                'buyer_sku_code' => $sku,
                'provider_category' => trim((string) ($item['kategori'] ?? '')) ?: null,
                'first_seen_at' => $seenAt,
            ];
        }

        foreach (array_chunk($rows, self::UPSERT_CHUNK) as $chunk) {
            // insertOrIgnore: two overlapping runs must not collide on the unique key.
            SupplierSkuSighting::insertOrIgnore($chunk);
        }
    }

    /**
     * Products whose BILLED price is below the active supplier cost — the rows
     * checkout's margin guard will refuse, surfaced before a customer finds one.
     *
     * Scanned per PLAN ROW, not against `products.price_member`: that column is
     * one tier's denormalised copy, so a VIP or reseller row under cost used to be
     * invisible here and could only ever appear as a refusal at checkout. A running
     * flash sale is scanned too, for the same reason — it is the price `PlanPrice`
     * returns for that product while the sale runs.
     *
     * The INNER JOIN on `products` is load-bearing: a pooled mapping has a null
     * `product_id` and therefore no selling price to compare, so it drops out here
     * for free. Do not "fix" this into a left join.
     *
     * @return array<int,array{product:string,sku:string,cost:int,tier:string,price:int}>
     */
    private function scanNegativeMargins(): array
    {
        $planRows = DB::table('product_plan_prices')
            ->join('products', 'products.id', '=', 'product_plan_prices.product_id')
            ->join('membership_plans', 'membership_plans.id', '=', 'product_plan_prices.membership_plan_id')
            ->join('supplier_products', function ($join) {
                $join->on('supplier_products.product_id', '=', 'products.id')
                    ->where('supplier_products.is_active', true);
            })
            ->whereColumn('product_plan_prices.price', '<', 'supplier_products.price')
            ->orderBy('products.name')
            ->get([
                'products.name',
                'supplier_products.buyer_sku_code',
                'supplier_products.price as cost',
                'product_plan_prices.price as billed',
                // Locale-keyed JSON, so the plan's stable code is the label.
                'membership_plans.code as plan_code',
            ])
            ->map(fn ($row) => [
                'product' => (string) $row->name,
                'sku' => (string) $row->buyer_sku_code,
                'cost' => (int) $row->cost,
                'tier' => (string) $row->plan_code,
                'price' => (int) $row->billed,
            ])
            ->all();

        return [...$planRows, ...$this->scanFlashSaleBelowCost()];
    }

    /**
     * A flash sale is a cut below the list price, and — since `PlanPrice` consults
     * it — the price the customer is actually charged while it runs. One priced
     * under the supplier's cost is a below-cost sale for every buyer, not just for
     * the tier that happens to be on the row.
     *
     * @return array<int,array{product:string,sku:string,cost:int,tier:string,price:int}>
     */
    private function scanFlashSaleBelowCost(): array
    {
        // Read through the same scope the pricing path uses, so "running" cannot
        // mean two things.
        $items = FlashSale::running()->with('items')->get()->flatMap->items;

        if ($items->isEmpty()) {
            return [];
        }

        $productIds = $items->pluck('product_id')->map(fn ($id) => (int) $id)->unique()->all();

        $mappings = SupplierProduct::query()
            ->whereIn('product_id', $productIds)
            ->where('is_active', true)
            ->get(['product_id', 'price', 'buyer_sku_code'])
            ->keyBy('product_id');

        $names = Product::query()->whereIn('id', $productIds)->pluck('name', 'id');

        $rows = [];

        foreach ($items as $item) {
            $mapping = $mappings->get((int) $item->product_id);

            if ($mapping === null || (int) $item->sale_price >= (int) $mapping->price) {
                continue;
            }

            $rows[] = [
                'product' => (string) ($names[(int) $item->product_id] ?? ''),
                'sku' => (string) $mapping->buyer_sku_code,
                'cost' => (int) $mapping->price,
                'tier' => 'flash sale',
                'price' => (int) $item->sale_price,
            ];
        }

        return $rows;
    }
}
