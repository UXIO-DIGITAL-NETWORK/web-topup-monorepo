<?php

use App\Services\Payment\MonetapayService;
use App\Services\UxiolabsService;

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'monetapay' => [
        'mch_id' => env('MONETAPAY_MCH_ID'),
        // The whole site trades as ONE Monetapay sub-merchant under `mch_id`.
        // Left blank, every call behaves exactly as it did before sub-merchants
        // existed (the field is dropped from the signed TreeMap when empty).
        'sub_mch_id' => env('MONETAPAY_SUB_MCH_ID'),
        'collection_app_id' => env('MONETAPAY_COLLECTION_APP_ID'),
        'disbursement_app_id' => env('MONETAPAY_DISBURSEMENT_APP_ID', env('MONETAPAY_MCH_ID')),
        'partner_key' => env('MONETAPAY_PARTNER_KEY'),
        'token' => env('MONETAPAY_TOKEN'),
        'aes_key' => env('MONETAPAY_AES_KEY'),
        'aes_iv' => env('MONETAPAY_AES_IV'),
        // Disbursement apps may have separate credentials from the collection app.
        // Falls back to the collection credentials if not explicitly set.
        'disbursement_partner_key' => env('MONETAPAY_DISBURSEMENT_PARTNER_KEY', env('MONETAPAY_PARTNER_KEY')),
        'disbursement_token' => env('MONETAPAY_DISBURSEMENT_TOKEN', env('MONETAPAY_TOKEN')),
        'disbursement_aes_key' => env('MONETAPAY_DISBURSEMENT_AES_KEY', env('MONETAPAY_AES_KEY')),
        'disbursement_aes_iv' => env('MONETAPAY_DISBURSEMENT_AES_IV', env('MONETAPAY_AES_IV')),
        'is_production' => env('MONETAPAY_IS_PRODUCTION', false),
        // No `https://example.com` default: this one is handed to a live
        // payment gateway, which then bounces a paying customer to a domain
        // IANA reserved for documentation.
        'success_redirect_url' => env('MONETAPAY_SUCCESS_REDIRECT_URL'),
        'failed_redirect_url' => env('MONETAPAY_FAILED_REDIRECT_URL', ''),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],
    'uxiolabs' => [
        'api_key' => env('UXIOTOPUP_API_KEY'),
        'base_url' => env('UXIOTOPUP_BASE_URL', 'https://api.uxiotopup.id'),
        // Sent as the `callback` field on every /order so uxiolabs knows where
        // to POST status updates (should point at /api/v1/uxiolabs/callback).
        'callback_url' => env('UXIOTOPUP_CALLBACK_URL'),
        // Which price tier from /service is booked as our supplier cost:
        // harga | harga_gold | harga_silver | harga_pro.
        'price_tier' => env('UXIOTOPUP_PRICE_TIER', 'harga'),
        // The webhook carries no signature — the only authentication is the
        // source IP. Comma-separated to allow extra IPs without a deploy.
        'callback_ips' => env('UXIOTOPUP_CALLBACK_IP', '103.146.202.50'),
        // How stale the stored price list may be before a checkout re-check that
        // could not reach the provider refuses to let the sale through. Matches
        // the sweep cadence on purpose: "fresher than one sync interval" is the
        // point at which we still know what the price is.
        'recheck_fresh_minutes' => (int) env('UXIOTOPUP_RECHECK_FRESH_MINUTES', 5),
    ],

    'supplier' => [
        // Which adapter serves as THE top-up supplier for this site. Adding a
        // supplier means adding its class to `adapters` and naming it here —
        // the transaction engine (App\Contracts\SupplierGateway) is not
        // touched. An unknown driver fails loudly (SupplierManager).
        'driver' => env('SUPPLIER_DRIVER', 'uxiolabs'),
        'adapters' => [
            'uxiolabs' => UxiolabsService::class,
        ],
    ],

    'payment' => [
        // Which adapter charges and pays out for this site (PAYMENT_DRIVER).
        // Adding a gateway means adding its class to `adapters` and naming it
        // here — checkout, payouts, callbacks and settlement are not touched.
        'driver' => env('PAYMENT_DRIVER', 'monetapay'),
        'adapters' => [
            'monetapay' => MonetapayService::class,
        ],
    ],

    'discord' => [
        'webhook_log_url' => env('DISCORD_WEBHOOK_LOG_URL'),

        // Off outside production on purpose. A seeder run on a box whose
        // webhook pointed at the live channel once put twenty-nine messages
        // there in a minute — all factory data — and buried the one that
        // needed a human. Turn this on where a staging feed is genuinely
        // wanted; it arrives prefixed with the environment name.
        'send_outside_production' => env('DISCORD_SEND_OUTSIDE_PRODUCTION', false),

        // How much of the invoice-delivery trail reaches Discord: `all` (every
        // delivered and failed attempt), `failures`, or `off`. A completed order
        // produces up to two rows, so this is a deliberate setting rather than a
        // default nobody chose.
        'invoice_log' => env('DISCORD_INVOICE_LOG', 'all'),
    ],

    'google' => [
        // OAuth Client ID for "Sign in with Google". Used as the audience when
        // verifying the ID token the storefront posts to /v1/auth/google — the
        // same value the frontend sets as VITE_GOOGLE_CLIENT_ID. No client
        // secret is needed: ID-token verification uses Google's public certs.
        'client_id' => env('GOOGLE_CLIENT_ID'),
    ],

    'piwapi' => [
        // WhatsApp gateway used to deliver the purchase receipt (bukti pembayaran)
        // as a document message. Credentials are usually set via the admin
        // Integration page (DB-backed) and fall back to these env defaults.
        //
        // OFF by default: WhatsApp delivery is part of the future subscription,
        // so nothing goes out over WhatsApp until it is switched on here. Email
        // is unaffected. Flipping this to true is the whole re-enable.
        'enabled' => env('PIWAPI_ENABLED', false),
        'api_url' => env('PIWAPI_API_URL', 'https://piwapi.com/api/send/whatsapp'),
        'account' => env('PIWAPI_ACCOUNT'),
        'secret' => env('PIWAPI_SECRET'),
    ],

    'storefront' => [
        // Consumer storefront base URL, used to build the "Track Order" link in
        // the receipt email. The tracker lives at /{locale}/cek-pesanan.
        // **No default.** It used to fall back to a dev server, which meant a
        // deployment that never set the variable sent real buyers a
        // `http://localhost:5173/...` refund claim link — and reported the send
        // as successful. Absent is now absent; `App\Support\PublicUrl` stops
        // the send rather than building a dead link. `.env.example` carries the
        // local value, which is what that file is for.
        'url' => env('STOREFRONT_URL'),
        'brand' => env('STOREFRONT_BRAND', 'TopupGame by Uxiolabs'),

        // Applied by `App\Support\Phone` only to a number that carries no
        // country code of its own — a customer who types "+65…" is always taken
        // at their word. This is what lets the ordinary Indonesian "0812…" keep
        // working without asking every buyer to pick a country.
        'default_country_code' => env('STOREFRONT_DEFAULT_COUNTRY_CODE', '62'),
    ],

    'payment_page' => [
        // Uxiolabs Pay, where a client renews the subscription to their own
        // website. The admin panel builds a deep link to the checkout page from
        // this; every route there is behind a login, so the client signs in
        // with their own payment-admin account on arrival.
        // No default, same reasoning as `storefront.url` above.
        'url' => env('PAYMENT_PAGE_URL'),
    ],

    'service_invoice' => [
        // How long a client has to pay before `services:expire` closes an
        // UNPAID service bill. Config rather than a column so the window can be
        // retuned without a migration.
        'due_days' => env('SERVICE_INVOICE_DUE_DAYS', 3),
    ],

    'withdrawal' => [
        // Kita's withdraw fee, a flat charge on every payout regardless of amount.
        // Read by App\Support\Withdrawal\WithdrawalFeeCalculator::fee() as
        // `fee_flat + round(fee_flat * fee_percent / 100)` = 1500 + 165 = 1665;
        // the merchant/internal requester is disbursed `nett = amount - fee`.
        // Config (not a column) so the schedule can change without a migration.
        'fee_flat' => (int) env('WITHDRAWAL_FEE_FLAT', 1500),
        'fee_percent' => (float) env('WITHDRAWAL_FEE_PERCENT', 11),
        // Floor on the requested amount. Must exceed the fee so `nett` stays
        // positive and clear the gateway's minimum payout. StoreWithdrawalRequest
        // enforces it.
        'min_amount' => (int) env('WITHDRAWAL_MIN_AMOUNT', 10000),
        // Fraud buffer ON TOP of each channel's Monetapay settlement window
        // (MonetapayContractFees::settlementDays). A sale becomes withdrawable
        // only after `settlement_days + hold_buffer_days` have passed since it
        // was paid — VA (T+0) holds 1 day, retail (T+3) holds 4. Policy knob,
        // separate from the contract facts, so it can move without touching them.
        'hold_buffer_days' => (int) env('WITHDRAWAL_HOLD_BUFFER_DAYS', 1),
    ],

    'hub' => [
        // Integration with the Uxio Hub (the internal cross-site panel). ALL
        // traffic is pull-only GETs: the Hub pulls this site's reporting
        // endpoints (/v1/hub/*), and this site pulls the catalog + channel-fee
        // settings from the Hub. One shared key serves both directions —
        // generated by the Hub when the site is registered, pasted here once.
        'enabled' => (bool) env('HUB_ENABLED', false),
        'api_key' => env('HUB_SITE_API_KEY'),
        'base_url' => env('HUB_BASE_URL'),
        // Comma-separated source-IP allowlist for the Hub's inbound pulls;
        // empty allows any IP (the key alone gates). Same convention as the
        // uxiolabs callback allowlist.
        'allowed_ips' => env('HUB_ALLOWED_IPS', ''),
        // When true, the site's own panel becomes read-only for the data the
        // Hub owns: the service catalog and the channel fee schedule.
        'managed_catalog' => (bool) env('HUB_MANAGED_CATALOG', true),
        'managed_channels' => (bool) env('HUB_MANAGED_CHANNELS', true),
        // The Hub also owns this site's own licence term, and enforcing it is
        // what makes a lapsed or suspended site stop serving the public. This
        // is the rollback switch for that whole mechanism: set it false and the
        // gate goes inert, the sync stops writing, and the site bills itself as
        // it always did.
        'managed_licence' => (bool) env('HUB_MANAGED_LICENCE', true),
        // Real-time push of a merchant's service order to the Hub (the one
        // site→Hub write, on top of the Hub's own 5-min pull). Kill-switch that
        // defaults to on whenever the Hub is enabled; set HUB_PUSH_ORDERS=false
        // to fall back to pull-only without disabling the rest of the Hub.
        'push_orders' => (bool) env('HUB_PUSH_ORDERS', (bool) env('HUB_ENABLED', false)),
        // The Hub's per-site service plan: which services this site's owner is
        // subscribed to, at which negotiated price, and which periods are due.
        // This site turns those into its OWN service_invoices, so the flag is
        // off by default and switched on one site at a time — the cutover that
        // actually issues bills, and the one to be able to stop instantly.
        // Rollback: set false. Nothing new is pulled, nothing new is issued,
        // and every invoice already issued keeps working exactly as it is.
        'managed_plan' => (bool) env('HUB_MANAGED_PLAN', false),
        // How often this site re-pulls from the Hub — catalog, channels, licence
        // and plan. One minute by default: a change made in the Hub has to reach
        // the client's site, and the client's bill, while the operator is still
        // watching. A pull is four cheap GETs; the pokes are unaffected and
        // remain immediate. Bump it if a deployment would rather be gentler.
        'sync_interval_minutes' => max(1, (int) env('HUB_SYNC_INTERVAL_MINUTES', 1)),
        // Money-path WRITE channel (approve/reject withdrawals + confirm/reject
        // service invoices FROM the Hub). Off by default and gated by a SEPARATE
        // key from the read key above — a leaked read key must never move money.
        // Empty write key = writes are dead even when enabled.
        'write_enabled' => (bool) env('HUB_WRITE_ENABLED', false),
        'write_api_key' => env('HUB_WRITE_API_KEY'),
    ],
];
