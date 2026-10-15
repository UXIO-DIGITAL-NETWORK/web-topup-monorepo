<?php

declare(strict_types=1);

namespace App\Actions\Uxiolabs;

use App\Actions\Pricing\WriteProductPricesAction;
use App\Contracts\SupplierGateway;
use App\DTOs\Uxiolabs\SupplierProductSyncResult;
use App\Enums\PriceChangeLogSource;
use App\Enums\PriceChangeLogStatus;
use App\Models\SupplierProduct;
use App\Support\Uxiolabs\PriceChangeLogRow;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Compares ONE supplier mapping against its row in the provider's price list and
 * says what should be written: the mapping row, the selling prices, and the audit
 * log row.
 *
 * Extracted so the 5-minute sweep and the on-demand checkout re-check cannot
 * drift apart. Two implementations of "cost moved, so reprice" would eventually
 * disagree — and the symptom would be a price the buyer was quoted coming from
 * one rule set while the charged price came from another.
 *
 * It does not write the mapping row itself: the sweep inserts thousands in
 * chunks, while the checkout path writes one. Both get the row here and store it
 * in whatever shape suits them.
 */
class SyncSupplierProductAction
{
    /** Columns an upsert may overwrite. `price` and the two status mirrors are the point of the run. */
    private const UPSERT_COLUMNS = [
        'price', 'provider_name', 'admin_fee', 'commission',
        'buyer_product_status', 'seller_product_status', 'is_active', 'sync_deactivated_at', 'updated_at',
    ];

    private const UPSERT_CHUNK = 500;

    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly WriteProductPricesAction $writePrices,
    ) {}

    /**
     * Writes mapping rows. Here rather than at each call site because the column
     * list *is* the contract: one path forgetting a column would silently stop
     * refreshing it (the sweep's own comment warns about exactly that), and the
     * two paths must write the same thing.
     *
     * @param  array<int,array<string,mixed>>  $rows
     */
    public static function upsert(array $rows): void
    {
        foreach (array_chunk($rows, self::UPSERT_CHUNK) as $chunk) {
            SupplierProduct::upsert($chunk, ['supplier_id', 'buyer_sku_code'], self::UPSERT_COLUMNS);
        }
    }

    /**
     * @param  array<string,mixed>  $item  One row from the provider's /service list
     */
    public function execute(
        SupplierProduct $mapping,
        array $item,
        Carbon $now,
        PriceChangeLogSource $source = PriceChangeLogSource::SWEEP,
    ): SupplierProductSyncResult {
        $cost = $this->uxiolabsService->costFor($item);
        $available = $this->uxiolabsService->isItemActive($item);

        $wasActive = (bool) $mapping->is_active;
        $reactivated = false;
        $deactivatedNow = false;

        if ($available && ! $wasActive && $mapping->sync_deactivated_at !== null) {
            // Only re-activate what the checker itself turned off: a manual admin
            // deactivation is never overridden.
            $isActive = true;
            $syncDeactivatedAt = null;
            $reactivated = true;
        } elseif (! $available && $wasActive) {
            $isActive = false;
            $syncDeactivatedAt = $now;
            $deactivatedNow = true;
        } else {
            $isActive = $wasActive;
            $syncDeactivatedAt = $mapping->sync_deactivated_at;
        }

        $costChanged = (int) $mapping->price !== $cost;

        // uxiolabs has a single aktif/nonaktif flag — mirror it into both status
        // columns so the schema stays untouched.
        $statusChanged = $isActive !== $wasActive
            || (bool) $mapping->buyer_product_status !== $available
            || (bool) $mapping->seller_product_status !== $available;

        // Provider-code verification: the service name is part of the identity the
        // provider hands us, so a drift from the stored snapshot is recorded (the
        // sweep reports it; `buyer_sku_code` itself is the key and cannot drift).
        $liveName = trim((string) ($item['nama_layanan'] ?? ''));
        $providerNameChanged = $liveName !== ''
            && (string) $mapping->provider_name !== ''
            && $liveName !== (string) $mapping->provider_name;

        // A pooled row renders from this snapshot (it has no product to read a name
        // from), so keep it in step with the provider. Once promoted, the product
        // owns the name and this is left as the record of what it was pooled as.
        $providerName = $mapping->product_id === null
            ? (string) ($item['nama_layanan'] ?? $mapping->provider_name)
            : $mapping->provider_name;

        $metaChanged = $providerName !== $mapping->provider_name;

        $product = $mapping->product;

        // The legacy columns as they stand *before* anything below writes: the log
        // records what each tier was, and the reprice updates the row in place, so
        // reading them afterwards would report the new price as the old one.
        $oldPrices = $product?->only(PriceChangeLogRow::TIERS) ?? [];

        $newPrices = null;
        $logStatus = null;
        $logRow = null;
        $repriceFailed = false;

        // Only mapped products have a selling price; a pooled row (product_id null)
        // has nothing to reprice or log — its cost still updates below.
        if ($mapping->product_id !== null && $product !== null) {
            if (! $available && $wasActive) {
                // Went dark at the provider — can't be sold until the admin handles
                // it. Attention outranks a locked-price note, so this is the only
                // row we write for the mapping this run.
                $logStatus = PriceChangeLogStatus::DEACTIVATED;
                $logRow = PriceChangeLogRow::make(
                    $logStatus, $mapping, $product, $oldPrices,
                    (int) $mapping->price, $cost, null,
                    'SKU dinonaktifkan di provider — perlu perhatian admin.', $now, $source->value,
                );
            } elseif ($costChanged && $isActive && $available) {
                try {
                    // Always reprice. A selling price left behind at an old cost is
                    // the one thing that makes checkout refuse a paying customer, so
                    // the margin rule is never second-guessed here.
                    //
                    // Its own transaction (a savepoint inside the sweep's run), so
                    // one row that cannot be repriced — a duplicate plan row, a lock
                    // wait — costs that row only. Without it the exception rolled
                    // back every other product's price and left the whole catalogue
                    // priced at the old cost, which is exactly what checkout refuses.
                    $newPrices = DB::transaction(
                        fn () => $this->writePrices->fromCost($product, $cost, $mapping)
                    );

                    $belowCost = PriceChangeLogRow::tiersBelowCost($newPrices, $cost);
                    $moved = PriceChangeLogRow::tiersMoved($oldPrices, $newPrices);

                    // A log row states what happened, so the status is read off the
                    // prices that were actually written: "applied" for a real
                    // movement, "unchanged" when the rule and the price window
                    // produced the same number, and the margin case first because it
                    // is the one that stops a sale.
                    $logStatus = match (true) {
                        $belowCost !== [] => PriceChangeLogStatus::NEGATIVE_MARGIN,
                        ! $moved => PriceChangeLogStatus::UNCHANGED,
                        default => PriceChangeLogStatus::APPLIED,
                    };

                    $logRow = PriceChangeLogRow::make(
                        $logStatus, $mapping, $product, $oldPrices, (int) $mapping->price, $cost, $newPrices,
                        match ($logStatus) {
                            PriceChangeLogStatus::NEGATIVE_MARGIN => 'Setelah markup & clamp, harga '
                                .implode('/', $belowCost).' masih di bawah modal.',
                            PriceChangeLogStatus::UNCHANGED => 'Modal berubah; harga jual tidak berubah (aturan margin dan batas harga menghasilkan angka yang sama).',
                            default => 'Harga jual diperbarui otomatis dari aturan margin.',
                        },
                        $now,
                        $source->value,
                    );
                } catch (Throwable $e) {
                    // The cost still lands (it is a fact); the selling price is left
                    // where it was and NO log row is written for it — a log that
                    // claims a price we did not write is worse than a gap.
                    $repriceFailed = true;

                    Log::channel('uxiolabs')->error('uxiolabs: reprice failed for one SKU', [
                        'buyer_sku_code' => $mapping->buyer_sku_code,
                        'product_id' => $product->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        // Nothing to write unless something actually moved. `metaChanged` has to be
        // part of this test AND of the upsert column list, or the refresh silently
        // never lands.
        $upsertRow = (! $costChanged && ! $statusChanged && ! $metaChanged) ? null : [
            'supplier_id' => $mapping->supplier_id,
            'buyer_sku_code' => $mapping->buyer_sku_code,
            'product_id' => $mapping->product_id,
            'pool_category_id' => $mapping->pool_category_id,
            'provider_name' => $providerName,
            'price' => $cost,
            'admin_fee' => $mapping->admin_fee,
            'commission' => $mapping->commission,
            'buyer_product_status' => $available,
            'seller_product_status' => $available,
            'is_active' => $isActive,
            'sync_deactivated_at' => $syncDeactivatedAt,
            'created_at' => $mapping->created_at,
            'updated_at' => $now,
        ];

        return new SupplierProductSyncResult(
            cost: $cost,
            costChanged: $costChanged,
            available: $available,
            isActive: $isActive,
            syncDeactivatedAt: $syncDeactivatedAt,
            statusChanged: $statusChanged,
            reactivated: $reactivated,
            deactivatedNow: $deactivatedNow,
            providerName: $providerName,
            metaChanged: $metaChanged,
            providerNameChanged: $providerNameChanged,
            newPrices: $newPrices,
            logStatus: $logStatus,
            logRow: $logRow,
            upsertRow: $upsertRow,
            repriceFailed: $repriceFailed,
        );
    }
}
