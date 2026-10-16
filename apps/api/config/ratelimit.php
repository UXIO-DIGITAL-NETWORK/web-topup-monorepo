<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Request ceilings, per minute
    |--------------------------------------------------------------------------
    |
    | Both numbers live here rather than in the provider because they are the
    | two that most often need revisiting when traffic changes, and a number
    | baked into code means a release for one line.
    |
    | They are keyed on the caller's user id when signed in, and on the IP when
    | not — so one office, or one mobile carrier's NAT, shares a single
    | allowance. That is why the ceiling is a per-IP figure and has to be read
    | as one; and why raising it is a legitimate answer when a crowd behind one
    | address starts getting refused.
    |
    | Set through .env, but it only takes effect once the config cache is
    | rebuilt (`config:cache`, which every deploy already runs).
    |
    */

    // The whole API group. This is the ceiling that breaks first as traffic
    // grows, long before the CPU does.
    'api_per_minute' => (int) env('RATE_LIMIT_API_PER_MINUTE', 120),

    // The checkout screen's pre-payment price check. Looser than `checkout`
    // (10/minute) because it is asked once per purchase attempt, but not as
    // generous as the read paths — every call it lets through may reach the
    // supplier.
    'recheck_per_minute' => (int) env('RATE_LIMIT_RECHECK_PER_MINUTE', 30),

];
