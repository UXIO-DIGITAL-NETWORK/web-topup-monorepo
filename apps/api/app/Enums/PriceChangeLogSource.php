<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Which path noticed a price change.
 *
 * `sweep` is the 5-minute sync (scheduled, manual command, or the HTTP tool);
 * `checkout` is a buyer's re-check at the moment they were about to pay.
 *
 * Recorded so the audit trail can be read without guessing, and so a burst of
 * checkout-sourced rows — the signal that the provider is moving prices under
 * us — is visible as itself rather than buried in the scheduled run's rows.
 */
enum PriceChangeLogSource: string
{
    case SWEEP = 'sweep';

    case CHECKOUT = 'checkout';
}
