<?php

declare(strict_types=1);

namespace App\Actions\Product;

use App\Exceptions\SupplierProductPoolException;
use App\Models\Product;

/**
 * Publishes a Main Product — the product-keyed door onto the same act the pool
 * pipeline calls Publish.
 *
 * The Main Products list used to offer "Activate", which wrote `products.status`
 * and nothing else. `Catalog::sellableProducts()` needs a second thing — an
 * active supplier mapping — so Activate produced products the admin was told
 * were live while the storefront could not see them, with no way to tell from
 * that screen. One verb now does both halves from either screen.
 *
 * The work itself stays in PublishSupplierProductAction: that is where
 * MapSupplierProductAction enforces "one active supplier per product", the rule
 * checkout's `supplierProducts->first()` quietly depends on. This resolves which
 * mapping to hand it and nothing more.
 */
class PublishProductAction
{
    public function __construct(private readonly PublishSupplierProductAction $publishMapping) {}

    /**
     * @throws SupplierProductPoolException
     */
    public function execute(Product $product): Product
    {
        $product->loadMissing('supplierProducts');

        if (($reason = $product->publishBlockedReason()) !== null) {
            throw new SupplierProductPoolException($reason);
        }

        // A mix has no mapping to activate — it is sellable through its
        // components, and `publishBlockedReason()` has already established that
        // every one of them is live. Publishing is then just this product's own
        // switch, and `published_at` is stamped once, exactly as for a normal
        // product (it is what separates "taken down" from "never live").
        if ($product->isMix()) {
            $product->update([
                'status' => true,
                'published_at' => $product->published_at ?? now(),
            ]);

            return $product->fresh(['supplierProducts', 'mixItems.component']);
        }

        return $this->publishMapping->execute($product->publishableMapping());
    }
}
