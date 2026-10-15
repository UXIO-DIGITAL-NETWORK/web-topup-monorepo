<?php

declare(strict_types=1);

namespace App\DTOs\Uxiolabs;

use App\Enums\PriceChangeLogStatus;
use Illuminate\Support\Carbon;

/**
 * What one supplier mapping looked like after being compared against its row in
 * the provider's price list — every field both callers need, so the sweep and
 * the on-demand checkout re-check can act on identical information.
 */
final readonly class SupplierProductSyncResult
{
    /**
     * @param  array<string,mixed>|null  $newPrices  What each tier is billed at after a reprice, or null when none ran
     * @param  array<string,mixed>|null  $logRow  A ready `price_change_logs` row, or null when nothing is worth recording
     * @param  array<string,mixed>|null  $upsertRow  The `supplier_products` row, or null when nothing moved
     */
    public function __construct(
        public int $cost,
        public bool $costChanged,
        public bool $available,
        public bool $isActive,
        public ?Carbon $syncDeactivatedAt,
        public bool $statusChanged,
        public bool $reactivated,
        public bool $deactivatedNow,
        /** Null for a pooled mapping whose provider name was never recorded. */
        public ?string $providerName,
        public bool $metaChanged,
        public bool $providerNameChanged,
        public ?array $newPrices,
        public ?PriceChangeLogStatus $logStatus,
        public ?array $logRow,
        public ?array $upsertRow,
        public bool $repriceFailed,
    ) {}
}
