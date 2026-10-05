<?php

declare(strict_types=1);

namespace App\Actions\Product;

use App\Actions\Log\CreateActivityLogAction;
use App\Actions\Pricing\WritePlanPricesAction;
use App\DTOs\Log\CreateActivityLogDTO;
use App\Exceptions\ProductDraftException;
use App\Models\Product;
use App\Models\SupplierProduct;
use App\Services\PricingService;
use App\Services\ProductRepricer;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Turns a supplier mapping into a DRAFT product.
 *
 * Two things stay off deliberately:
 *
 *  - `products.status = false`, so `Catalog::sellableProducts()` skips it.
 *  - `supplier_products.is_active = false`, the second, independent gate.
 *
 * Publishing is a separate, explicit act (`PublishProductAction`). That is why
 * this does NOT reuse MapSupplierProductAction, which activates the mapping: a
 * draft that arrives pre-activated is one `status` flip away from being sold.
 *
 * Extracted from `PromoteSupplierProductAction` when the pool stage went away:
 * adding a SKU from a provider now lands as a draft directly, and both entry
 * points must produce exactly the same product.
 */
class CreateDraftProductFromMappingAction
{
    public function __construct(
        private readonly PricingService $pricing,
        private readonly ProductRepricer $repricer,
        private readonly WritePlanPricesAction $writePlanPrices,
        private readonly CreateActivityLogAction $activityLogAction,
        private readonly RestoreProductAction $restoreAction,
    ) {}

    /**
     * Plan-keyed margins expressed in the legacy role vocabulary, for the four
     * frozen `products.price_*` columns that are still NOT NULL.
     *
     * @param  array<int,float>  $planMargins
     * @return array<string,float>
     */
    private function legacyShape(array $planMargins): array
    {
        $roleByPlan = array_flip(ProductRepricer::planIdByRole());
        $margins = [];

        foreach ($planMargins as $planId => $margin) {
            $role = $roleByPlan[$planId] ?? null;

            if ($role !== null) {
                $margins[$role] = $margin;
            }
        }

        return $margins;
    }

    public function execute(
        SupplierProduct $supplierProduct,
        ?int $categoryId = null,
        ?int $subCategoryId = null,
        ?string $name = null,
        ?string $code = null,
    ): Product {
        $categoryId ??= $supplierProduct->pool_category_id;
        $code = trim((string) ($code ?? $supplierProduct->buyer_sku_code));

        if ($code === '') {
            throw new ProductDraftException('Kode produk tidak boleh kosong.');
        }

        // withTrashed: an archived product still holds its code — the unique
        // index does not forget, so neither may this check.
        $existing = Product::withTrashed()->where('code', $code)->first();

        if ($existing) {
            // A live (or draft) product already owns this code — a genuine clash
            // the admin has to resolve. Nothing to reuse.
            if (! $existing->trashed()) {
                throw new ProductDraftException("Kode produk '{$code}' sudah dipakai produk lain.");
            }

            // The code belongs to a product that was archived. Same code = same
            // catalogue identity, so bringing it back is a restore — no second
            // draft, no unique-index clash.
            return $this->restoreAction->execute($existing);
        }

        return DB::transaction(function () use ($supplierProduct, $categoryId, $subCategoryId, $name, $code) {
            $planMargins = $this->repricer->planMargins($supplierProduct);

            // All five legacy price columns are NOT NULL with no default, so
            // they still have to be resolved here. The real per-plan prices are
            // written after the product exists — they need its id.
            $prices = $this->pricing->computePrices(
                (int) $supplierProduct->price,
                $categoryId,
                $this->legacyShape($planMargins),
                $supplierProduct->price_min,
                $supplierProduct->price_max,
            );

            $product = Product::create([
                'category_id' => $categoryId,
                'sub_category_id' => $subCategoryId,
                'name' => $name ?: ($supplierProduct->provider_name ?: $supplierProduct->buyer_sku_code),
                'code' => $code,
                'status' => false,
                'published_at' => null,
                'price_min' => $supplierProduct->price_min,
                'price_max' => $supplierProduct->price_max,
                // Decided on the margin page, alongside the window above — null
                // stays null, which is what selects the global points settings
                // rather than "earns nothing".
                'point_percent' => $supplierProduct->point_percent,
                'point_flat' => $supplierProduct->point_flat,
                ...$prices,
            ]);

            $supplierProduct->update([
                'product_id' => $product->id,
                'pool_category_id' => $categoryId,
                'is_active' => false,
            ]);

            // The real prices, now that the product has an id. Written after
            // creation rather than folded into it, because they are rows in
            // another table keyed on the product.
            $this->writePlanPrices->execute(
                $product,
                $this->pricing->computePlanPrices(
                    (int) $supplierProduct->price,
                    $categoryId,
                    $planMargins,
                    $supplierProduct->price_min,
                    $supplierProduct->price_max,
                ),
            );

            $this->activityLogAction->execute(new CreateActivityLogDTO(
                userId: Auth::id(),
                ipAddress: request()->ip(),
                userAgent: request()->userAgent(),
                message: "Created draft product {$product->code} from provider SKU {$supplierProduct->buyer_sku_code}",
            ));

            return $product;
        });
    }
}
