<?php

declare(strict_types=1);

namespace App\Actions\Product;

use App\Actions\Log\CreateActivityLogAction;
use App\Contracts\SupplierGateway;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Exceptions\ProductDraftException;
use App\Models\SupplierCategory;
use App\Models\SupplierProduct;
use App\Support\Uxiolabs\UxiolabsSupplier;
use Illuminate\Support\Facades\Auth;

/**
 * Adds provider SKUs as DRAFT products, directly.
 *
 * This is the pool stage's replacement: instead of staging a mapping with no
 * product and making the admin promote it later, the mapping and its draft
 * product are created in one step, so whatever the admin picks in the provider
 * category shows up on the products page immediately — unpublished, awaiting a
 * name/price/margin decision.
 *
 * The margin gate that guarded promotion is deliberately absent: a draft that
 * carries the default markup is exactly what "set the margin later" means. The
 * storefront still cannot see it, because the draft is `status = false` and its
 * mapping is `is_active = false`.
 *
 * Resilient per row, like the pool action it replaces: one unknown SKU in a
 * selection of 200 must not lose the other 199.
 */
class AddProductsFromSupplierAction
{
    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly CreateDraftProductFromMappingAction $creator,
        private readonly CreateActivityLogAction $activityLogAction,
    ) {}

    /**
     * @param  array<int,string>  $buyerSkuCodes
     * @return array{created:int,skipped:array<int,array{buyer_sku_code:string,reason:string}>}
     */
    public function execute(array $buyerSkuCodes): array
    {
        $codes = array_values(array_unique(array_map('strval', $buyerSkuCodes)));

        $supplier = UxiolabsSupplier::model();

        if (! $supplier) {
            return [
                'created' => 0,
                'skipped' => array_map(fn ($sku) => [
                    'buyer_sku_code' => (string) $sku,
                    'reason' => 'Supplier Uxiotopup belum terdaftar.',
                ], $codes),
            ];
        }

        // Indexed once for the whole batch. Looking each SKU up through
        // findServiceInPriceList() would rescan an MB-sized list per row.
        $priceList = $this->uxiolabsService->keyedPriceListCached();

        $mappings = SupplierCategory::where('supplier_id', $supplier->id)
            ->pluck('category_id', 'provider_category');

        /** @var array<string,SupplierProduct> $existing */
        $existing = SupplierProduct::where('supplier_id', $supplier->id)->get()->keyBy('buyer_sku_code');

        $skipped = [];
        $created = 0;

        foreach ($codes as $sku) {
            $item = $priceList[$sku] ?? null;

            if ($item === null) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'Layanan tidak ditemukan di price list Uxiotopup.'];

                continue;
            }

            $mapping = $existing[$sku] ?? null;

            if ($mapping && $mapping->product_id !== null) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'SKU sudah dipakai produk lain.'];

                continue;
            }

            if (! $mapping) {
                $kategori = trim((string) ($item['kategori'] ?? ''));
                $categoryId = $mappings->get($kategori);

                if ($categoryId === null) {
                    $skipped[] = [
                        'buyer_sku_code' => $sku,
                        'reason' => "Kategori provider '{$kategori}' belum dipetakan di Category Provider.",
                    ];

                    continue;
                }

                $cost = $this->uxiolabsService->costFor($item);

                if ($cost <= 0) {
                    $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'Harga modal dari Uxiotopup tidak valid.'];

                    continue;
                }

                $available = $this->uxiolabsService->isItemActive($item);

                $mapping = SupplierProduct::create([
                    'product_id' => null,
                    'supplier_id' => $supplier->id,
                    'pool_category_id' => $categoryId,
                    'buyer_sku_code' => $sku,
                    'provider_name' => (string) ($item['nama_layanan'] ?? $sku),
                    'price' => $cost,
                    'buyer_product_status' => $available,
                    'seller_product_status' => $available,
                    // Stays false until publishing — the second storefront gate.
                    'is_active' => false,
                    'is_price_locked' => false,
                    'margin_set_at' => null,
                ]);

                $existing[$sku] = $mapping;
            }

            try {
                $this->creator->execute($mapping);
                $created++;
            } catch (ProductDraftException $e) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => $e->getMessage()];
            }
        }

        if ($created > 0) {
            // One log line for the batch: 200 rows must not mean 200 log rows.
            $this->activityLogAction->execute(new CreateActivityLogDTO(
                userId: Auth::id(),
                ipAddress: request()->ip(),
                userAgent: request()->userAgent(),
                message: "Added {$created} product draft(s) from provider SKUs",
            ));
        }

        return ['created' => $created, 'skipped' => $skipped];
    }
}
