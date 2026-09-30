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
use Throwable;

/**
 * Adds provider SKUs as products, configured in the same call.
 *
 * This is the pool stage's replacement, and then some: each entry can carry the
 * name, code, discount, points, price window, margins and mix the admin typed in
 * the modal, so a product is finished where it is created instead of being
 * created here and edited on another screen.
 *
 * It is deliberately COMPOSITION, not a second implementation: the draft comes
 * from `CreateDraftProductFromMappingAction`, the prices from
 * `SetProductMarginAction` (the single writer), the composition from
 * `SetProductMixAction`, and going live from `PublishProductAction`. The order
 * matters — mix rewrites the cost and re-derives prices, so margins must be
 * stored first.
 *
 * Resilient per row, like the pool action it replaced: one unknown SKU in a
 * selection of fifty must not lose the other forty-nine.
 */
class AddProductsFromSupplierAction
{
    public function __construct(
        private readonly SupplierGateway $uxiolabsService,
        private readonly CreateDraftProductFromMappingAction $creator,
        private readonly SetProductMarginAction $marginAction,
        private readonly SetProductMixAction $mixAction,
        private readonly PublishProductAction $publishAction,
        private readonly CreateActivityLogAction $activityLogAction,
    ) {}

    /**
     * @param  array<int,array<string,mixed>>  $items
     * @return array{created:int,published:int,skipped:array<int,array{buyer_sku_code:string,reason:string}>}
     */
    public function execute(array $items): array
    {
        $supplier = UxiolabsSupplier::model();

        if (! $supplier) {
            return [
                'created' => 0,
                'published' => 0,
                'skipped' => array_map(fn (array $item) => [
                    'buyer_sku_code' => (string) $item['buyer_sku_code'],
                    'reason' => 'Supplier Uxiotopup belum terdaftar.',
                ], $items),
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
        $published = 0;
        $handled = [];

        foreach ($items as $item) {
            $sku = (string) $item['buyer_sku_code'];

            // The same SKU twice in one payload is the modal's mistake, not a
            // second product.
            if (isset($handled[$sku])) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'SKU yang sama muncul lebih dari sekali.'];

                continue;
            }

            $handled[$sku] = true;

            $entry = $priceList[$sku] ?? null;

            if ($entry === null) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'Layanan tidak ditemukan di price list Uxiotopup.'];

                continue;
            }

            $mapping = $existing[$sku] ?? null;

            if ($mapping && $mapping->product_id !== null) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'SKU sudah dipakai produk lain.'];

                continue;
            }

            if (! $mapping) {
                $kategori = trim((string) ($entry['kategori'] ?? ''));
                $categoryId = $mappings->get($kategori);

                if ($categoryId === null) {
                    $skipped[] = [
                        'buyer_sku_code' => $sku,
                        'reason' => "Kategori provider '{$kategori}' belum dipetakan di Category Provider.",
                    ];

                    continue;
                }

                $cost = $this->uxiolabsService->costFor($entry);

                if ($cost <= 0) {
                    $skipped[] = ['buyer_sku_code' => $sku, 'reason' => 'Harga modal dari Uxiotopup tidak valid.'];

                    continue;
                }

                $available = $this->uxiolabsService->isItemActive($entry);

                $mapping = SupplierProduct::create([
                    'product_id' => null,
                    'supplier_id' => $supplier->id,
                    'pool_category_id' => $categoryId,
                    'buyer_sku_code' => $sku,
                    'provider_name' => (string) ($entry['nama_layanan'] ?? $sku),
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
                $product = $this->creator->execute($mapping, null, null, $item['name'], $item['code']);

                $this->applyConfiguration($product, $item);

                if ($item['publish']) {
                    // A publish the provider refuses (SKU switched off, a mix
                    // component not live) is reported, not thrown: the product
                    // is still created, as a draft.
                    $this->publishAction->execute($product);
                    $published++;
                }

                $created++;
            } catch (ProductDraftException $e) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => $e->getMessage()];
            } catch (Throwable $e) {
                $skipped[] = ['buyer_sku_code' => $sku, 'reason' => $e->getMessage()];
            }
        }

        if ($created > 0) {
            // One log line for the batch: fifty rows must not mean fifty log rows.
            $this->activityLogAction->execute(new CreateActivityLogDTO(
                userId: Auth::id(),
                ipAddress: request()->ip(),
                userAgent: request()->userAgent(),
                message: "Added {$created} product(s) from provider SKUs ({$published} published)",
            ));
        }

        return ['created' => $created, 'published' => $published, 'skipped' => $skipped];
    }

    /**
     * Everything the admin typed, applied to the freshly created draft.
     *
     * Pricing goes through `SetProductMarginAction` rather than writing columns
     * here, so there stays exactly one writer of `product_plan_prices`.
     *
     * @param  array<string,mixed>  $item
     */
    private function applyConfiguration($product, array $item): void
    {
        // The discount is the one field the margin action does not own: it is a
        // plain column on the product, read by `PlanPrice`.
        if ($item['discount_type'] !== null || $item['discount_value'] !== null) {
            $product->update([
                'discount_type' => $item['discount_type'],
                'discount_value' => $item['discount_value'],
            ]);
        }

        $hasPricing = $item['margins'] !== []
            || $item['price_min'] !== null
            || $item['price_max'] !== null
            || $item['point_percent'] !== null
            || $item['point_flat'] !== null;

        if ($hasPricing) {
            $this->marginAction->execute(
                $product,
                $item['margins'],
                $item['price_min'],
                $item['price_max'],
                $item['price_min'] !== null || $item['price_max'] !== null,
                $item['point_percent'],
                $item['point_flat'],
                $item['point_percent'] !== null || $item['point_flat'] !== null,
            );
        }

        // Last, because it rewrites the product's cost and re-derives its prices
        // from the margins stored just above.
        if ($item['mix_items'] !== []) {
            $this->mixAction->execute($product, $item['mix_items']);
        }
    }
}
