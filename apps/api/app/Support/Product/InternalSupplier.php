<?php

declare(strict_types=1);

namespace App\Support\Product;

use App\Models\Supplier;

/**
 * The platform's own supplier — the row a manually-added product is mapped to.
 *
 * A product is only sellable while it carries an ACTIVE supplier mapping
 * (`Catalog::sellableProducts()`), and a product created by hand has no provider
 * behind it. Mapping it here satisfies that gate and marks the order as one a
 * human fulfils, rather than leaving a product that silently never appears on
 * the storefront.
 *
 * Resolved by `is_system` rather than by name or id: the seeder's fixed ids are
 * not something to depend on, and the name is a label the operator may reword.
 */
final class InternalSupplier
{
    /** Default name, used only if the row has to be created. */
    public const NAME = 'Internal System';

    /** Non-creating lookup, for callers that must not add master data as a side effect. */
    public static function find(): ?Supplier
    {
        return Supplier::where('is_system', true)->first();
    }

    public static function model(): Supplier
    {
        return self::find()
            ?? Supplier::firstOrCreate(
                ['name' => self::NAME],
                ['status' => true, 'is_system' => true],
            );
    }
}
