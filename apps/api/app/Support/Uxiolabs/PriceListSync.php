<?php

declare(strict_types=1);

namespace App\Support\Uxiolabs;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * How old the price list we hold actually is.
 *
 * The sweep and an on-demand checkout re-check both fetch the provider's bulk
 * catalogue, and two different questions follow from that:
 *
 *  - how long ago anything was synced, so a failing live fetch can be judged
 *    against "we still hold a recent snapshot" rather than blocking a sale for
 *    no reason;
 *  - whether a fetch landed moments ago, so a burst of checkouts shares one
 *    upstream call instead of hammering the provider once per buyer.
 *
 * Deliberately not read off the price-list cache: that entry's TTL is the fetch
 * window, and conflating the two would let "the cache is warm" answer a question
 * about freshness it cannot actually answer.
 */
final class PriceListSync
{
    private const LAST_FETCH_KEY = 'uxiolabs:price-list-fetched-at';

    private const LAST_SYNC_KEY = 'uxiolabs:last-sync-at';

    /** Long enough to outlive any plausible outage; the value inside is the timestamp. */
    private const REMEMBER_SECONDS = 86400;

    /** Stamped by every successful fetch — the sweep's and a re-check's alike. */
    public static function markFetched(): void
    {
        $at = now()->getTimestamp();

        Cache::put(self::LAST_FETCH_KEY, $at, self::REMEMBER_SECONDS);
        Cache::put(self::LAST_SYNC_KEY, $at, self::REMEMBER_SECONDS);
    }

    /** True when a fetch landed within `$seconds` — the anti-burst window. */
    public static function fetchedWithin(int $seconds): bool
    {
        $at = Cache::get(self::LAST_FETCH_KEY);

        return $at !== null && (time() - (int) $at) <= $seconds;
    }

    /**
     * True when the data we hold is still worth trusting: something synced within
     * `$minutes`. This is what lets a failed live check pass a buyer through
     * instead of blocking a sale over a call that may simply have timed out.
     */
    public static function isFresh(int $minutes): bool
    {
        $at = Cache::get(self::LAST_SYNC_KEY);

        return $at !== null && (time() - (int) $at) <= $minutes * 60;
    }

    public static function lastSyncedAt(): ?Carbon
    {
        $at = Cache::get(self::LAST_SYNC_KEY);

        return $at === null ? null : Carbon::createFromTimestamp((int) $at);
    }
}
