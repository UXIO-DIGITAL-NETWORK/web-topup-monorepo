<?php

declare(strict_types=1);

namespace App\Actions\Product;

use App\Exceptions\ProductDraftException;
use App\Exceptions\SupplierProductPoolException;
use App\Models\Product;
use App\Models\SupplierProduct;

/**
 * Promotes a priced pool row into a Main Product — as a DRAFT.
 *
 * The pool stage is no longer used by the admin panel (adding a SKU from a
 * provider now creates the draft directly), but this stays because pooled rows
 * may still exist and because it owns the one gate the pool flow needed: a SKU
 * whose margin has not been decided must not become a product.
 *
 * The product itself is built by `CreateDraftProductFromMappingAction`, shared
 * with the direct path so both produce exactly the same row.
 */
class PromoteSupplierProductAction
{
    public function __construct(
        private readonly CreateDraftProductFromMappingAction $creator,
    ) {}

    /**
     * @throws SupplierProductPoolException
     */
    public function execute(
        SupplierProduct $supplierProduct,
        ?int $categoryId = null,
        ?int $subCategoryId = null,
        ?string $name = null,
        ?string $code = null,
    ): Product {
        // The gate the pool pipeline exists for: no price decision, no product.
        if ($reason = $supplierProduct->promoteBlockedReason()) {
            throw new SupplierProductPoolException($reason);
        }

        try {
            return $this->creator->execute($supplierProduct, $categoryId, $subCategoryId, $name, $code);
        } catch (ProductDraftException $e) {
            // The controller and the bulk actions only know this one exception;
            // keep their 422 and per-row skip behaviour unchanged.
            throw new SupplierProductPoolException($e->getMessage());
        }
    }
}
