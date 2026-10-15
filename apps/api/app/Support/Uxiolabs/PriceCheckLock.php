<?php

declare(strict_types=1);

namespace App\Support\Uxiolabs;

use Closure;
use Illuminate\Support\Facades\Cache;

/**
 * The one choke point every price-sync path goes through.
 *
 * The scheduled sweep carries `withoutOverlapping`, but the manual console
 * command, the HTTP endpoint and the checkout re-check do not. Two overlapping
 * runs read the same snapshot, both see the cost move, and each writes a log row
 * for one real change — doubling every count in the report and the audit trail
 * with it.
 *
 * Shared rather than owned by the sweep for one reason: the on-demand re-check
 * has to exclude itself against the very same run. That is what makes "one
 * writer at a time" a fact instead of a hope.
 */
final class PriceCheckLock
{
    public const KEY = 'uxiolabs:price-check';

    /** Past the worst case (an upstream fetch plus thousands of rows); a crashed run must not wedge the schedule. */
    public const SECONDS = 300;

    /**
     * Run `$work` while holding the lock, or return null when another run holds
     * it. Null is a real answer, not an error: the caller decides what to do
     * without the lock (the checkout path reads the snapshot the running sweep
     * just wrote, rather than fetching a second copy).
     */
    public static function attempt(Closure $work): mixed
    {
        $lock = Cache::lock(self::KEY, self::SECONDS);

        if (! $lock->get()) {
            return null;
        }

        try {
            return $work();
        } finally {
            $lock->release();
        }
    }
}
