<?php

declare(strict_types=1);

namespace App\Actions\Product;

use App\Models\Product;
use App\Models\SupplierProduct;
use App\Support\Product\InternalSupplier;

/**
 * Keeps a manually-added product mapped to the Internal System supplier.
 *
 * Two jobs, and both matter:
 *
 *  - `Catalog::sellableProducts()` only serves products with an ACTIVE supplier
 *    mapping, so without this a hand-made product is invisible to the storefront
 *    no matter how often it is published.
 *  - The mapping carries the COST (`price`), which is what the checkout margin
 *    guard compares the selling price against. Syncing it on every save is what
 *    stops the recorded margin drifting away from the admin's own numbers.
 */
class MapProductToInternalSupplierAction
{
    /**
     * Attach on create, refresh on update. `is_active` is set when the mapping is
     * first created and left alone afterwards — publishing/unpublishing owns it
     * from then on, and re-asserting it here would quietly undo an unpublish.
     */
    public function execute(Product $product): SupplierProduct
    {
        $supplier = InternalSupplier::model();

        $mapping = SupplierProduct::where('supplier_id', $supplier->id)
            ->where(function ($query) use ($product) {
                $query->where('product_id', $product->getKey())
                    ->orWhere('buyer_sku_code', (string) $product->code);
            })
            ->first();

        $isNew = $mapping === null;
        $mapping ??= new SupplierProduct(['supplier_id' => $supplier->id]);

        $mapping->fill([
            'product_id' => $product->getKey(),
            'buyer_sku_code' => (string) $product->code,
            'pool_category_id' => $product->category_id,
            'provider_name' => (string) $product->name,
            // The manual product's cost. `price_modal` is what the admin typed as
            // modal, and the margin guard reads it back from here.
            'price' => (int) $product->price_modal,
            'buyer_product_status' => true,
            'seller_product_status' => true,
            'is_price_locked' => false,
            // The price checker must never claim ownership of a mapping a human
            // switched off.
            'sync_deactivated_at' => null,
        ]);

        if ($isNew) {
            $mapping->is_active = true;
        }

        $mapping->save();

        return $mapping;
    }

    /**
     * Refresh an existing manual mapping after an edit — and only that.
     *
     * Products mapped to a real provider must be left alone: editing one of them
     * must not quietly attach the Internal System supplier. This is also why the
     * lookup here does not create the supplier row.
     */
    public function sync(Product $product): ?SupplierProduct
    {
        $supplier = InternalSupplier::find();

        if ($supplier === null) {
            return null;
        }

        $exists = SupplierProduct::where('supplier_id', $supplier->getKey())
            ->where('product_id', $product->getKey())
            ->exists();

        return $exists ? $this->execute($product) : null;
    }
}
