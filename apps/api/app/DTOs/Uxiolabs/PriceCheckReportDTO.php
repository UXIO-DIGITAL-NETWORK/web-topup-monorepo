<?php

namespace App\DTOs\Uxiolabs;

readonly class PriceCheckReportDTO
{
    /**
     * @param  array<int,string>  $deactivated  service ids turned off by this run
     * @param  array<int,string>  $reactivated  service ids turned back on by this run
     * @param  array<int,array{product:string,sku:string,cost:int,tier:string,price:int}>  $negativeMargin
     * @param  array<int,string>  $unknownSkusSample  first N service ids with no local mapping (never auto-created)
     * @param  array<int,string>  $failedSkusSample  first N service ids whose reprice raised (cost still updated, price left alone)
     * @param  int  $providerNameChangedCount  mapped SKUs whose provider service name drifted from the stored snapshot
     * @param  array<int,array{sku:string,old_name:string,new_name:string}>  $providerNameChanges  first N of those, for the log/report
     * @param  int  $disappearedCount  mapped SKUs no longer present in the provider price list this run
     * @param  array<int,string>  $disappearedSkusSample  first N of those service ids
     * @param  string|null  $skippedReason  set when nothing ran at all — another sync held the lock
     */
    public function __construct(
        public int $totalFetched,
        public int $priceChangedCount,
        public int $repricedCount = 0,
        public int $unchangedCount = 0,
        public int $failedCount = 0,
        public int $negativeMarginCount = 0,
        public int $deactivatedLoggedCount = 0,
        public array $deactivated = [],
        public array $reactivated = [],
        public array $negativeMargin = [],
        public int $unknownCount = 0,
        public array $unknownSkusSample = [],
        public array $failedSkusSample = [],
        public int $providerNameChangedCount = 0,
        public array $providerNameChanges = [],
        public int $disappearedCount = 0,
        public array $disappearedSkusSample = [],
        public ?string $skippedReason = null,
    ) {}

    /**
     * Nothing ran: another sync held the lock. Every counter is zero because every
     * counter is true — this is not a failure, and the run it collided with will
     * report what actually happened.
     */
    public static function skipped(string $reason): self
    {
        return new self(totalFetched: 0, priceChangedCount: 0, skippedReason: $reason);
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'total_fetched' => $this->totalFetched,
            'price_changed' => $this->priceChangedCount,
            'repriced' => $this->repricedCount,
            'unchanged' => $this->unchangedCount,
            'failed' => $this->failedCount,
            'negative_margin_count' => $this->negativeMarginCount,
            'deactivated_logged' => $this->deactivatedLoggedCount,
            'deactivated' => $this->deactivated,
            'reactivated' => $this->reactivated,
            'negative_margin' => $this->negativeMargin,
            'unknown_count' => $this->unknownCount,
            'unknown_skus_sample' => $this->unknownSkusSample,
            'failed_skus_sample' => $this->failedSkusSample,
            'provider_name_changed' => $this->providerNameChangedCount,
            'provider_name_changes' => $this->providerNameChanges,
            'disappeared_count' => $this->disappearedCount,
            'disappeared_skus_sample' => $this->disappearedSkusSample,
            'skipped_reason' => $this->skippedReason,
        ];
    }
}
