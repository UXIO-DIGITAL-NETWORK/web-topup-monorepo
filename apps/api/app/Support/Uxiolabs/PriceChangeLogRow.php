<?php

declare(strict_types=1);

namespace App\Support\Uxiolabs;

use App\Enums\PriceChangeLogStatus;
use App\Models\Product;
use App\Models\SupplierProduct;
use Illuminate\Support\Carbon;

/**
 * Builds one `price_change_logs` row as a raw array.
 *
 * Shared by the scheduled sweep and the on-demand checkout re-check so the two
 * write the same shape: the audit trail is read as one list, and a row whose
 * columns mean something slightly different depending on who wrote it would be
 * worse than no row at all.
 *
 * Raw array, not a model: the sweep accumulates thousands and inserts them in
 * chunks, so `insert()` bypasses casts and the timestamps are explicit.
 */
final class PriceChangeLogRow
{
    /**
     * @param  array<string,mixed>  $oldPrices  The legacy price columns as they stood *before* the reprice
     * @param  array{price_modal:int,price_member:int,price_vip:int,price_reseller:int,price_agent:int}|null  $newPrices
     * @return array<string,mixed>
     */
    public static function make(
        PriceChangeLogStatus $status,
        SupplierProduct $mapping,
        Product $product,
        array $oldPrices,
        int $oldCost,
        int $newCost,
        ?array $newPrices,
        string $reason,
        Carbon $now,
        string $source,
    ): array {
        return [
            'supplier_product_id' => $mapping->id,
            'product_id' => $product->id,
            'buyer_sku_code' => $mapping->buyer_sku_code,
            'product_name' => $product->name,
            'status' => $status->value,
            // Which path noticed it: the 5-minute sweep, or a buyer's checkout.
            'source' => $source,
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

    /** The billed tiers, in the order the log columns list them. */
    public const TIERS = ['price_member', 'price_vip', 'price_reseller', 'price_agent'];

    /**
     * Whether any tier's billed price actually moved — the difference between a
     * reprice that changed something and one that re-derived the same number.
     *
     * @param  array<string,mixed>  $old  The legacy columns as they stood before the write
     * @param  array<string,int>  $new  What each tier is billed at now
     */
    public static function tiersMoved(array $old, array $new): bool
    {
        foreach (self::TIERS as $tier) {
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
     * whichever tier the customer is on, so a VIP row under cost refuses a VIP
     * customer even when the member price is healthy.
     *
     * @param  array<string,int>  $new  What each tier is billed at
     * @return array<int,string> e.g. ['member', 'vip']
     */
    public static function tiersBelowCost(array $new, int $cost): array
    {
        $below = [];

        foreach (self::TIERS as $tier) {
            if (isset($new[$tier]) && (int) $new[$tier] < $cost) {
                $below[] = str_replace('price_', '', $tier);
            }
        }

        return $below;
    }
}
