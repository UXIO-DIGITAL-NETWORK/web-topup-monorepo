<?php

namespace App\Providers;

use App\Contracts\PaymentGateway;
use App\Contracts\SupplierGateway;
use App\Services\DiscordWebhookService;
use App\Support\Integration\PaymentManager;
use App\Support\Integration\SupplierManager;
use App\Support\Storefront\Catalog;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Pusher\PusherException;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // The supplier seam. The transaction engine depends on the contract;
        // which adapter answers it is a config decision (SUPPLIER_DRIVER), so a
        // site on a different top-up supplier adds one adapter class and changes
        // one line — it never edits the engine.
        $this->app->bind(SupplierGateway::class, fn () => SupplierManager::make());

        // The same seam for the payment gateway: which adapter charges and
        // pays out is a config decision (PAYMENT_DRIVER), not a code decision.
        $this->app->bind(PaymentGateway::class, fn () => PaymentManager::make());
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Which proxies' X-Forwarded-* headers we believe. Unset means trust
        // none, which is the safe default — and the reason HUB_ALLOWED_IPS and
        // the uxiolabs webhook's IP allowlist start rejecting every legitimate
        // call once the site sits behind nginx or a load balancer. See
        // config/app.php.
        //
        // Done here rather than in bootstrap/app.php because that middleware
        // callback runs before the config repository is bound.
        $trusted = config('app.trusted_proxies');

        if (is_string($trusted) && $trusted !== '') {
            TrustProxies::at(
                $trusted === '*' ? '*' : array_map('trim', explode(',', $trusted))
            );
        }

        $this->configureRateLimiting();
        $this->configureRouteBindings();
        $this->configureRealtimeAlerts();
    }

    /**
     * Make a failed realtime push audible, without making it fatal.
     *
     * A push that does not land is a DEGRADED mode, not a lost bill: the
     * payment page's fallback poll still delivers it seconds later. So the
     * broadcast itself is rescued (see ServiceInvoiceUpdated's ShouldRescue) and
     * this only decides what is said about it.
     *
     * Silence is the thing to avoid. The queued broadcast this replaces could
     * fail invisibly — a dead worker meant every merchant's page quietly stopped
     * updating, and nothing anywhere reported it.
     *
     * Chatty is the other thing to avoid: Pusher being down fails EVERY push at
     * once, so this is deduped to one alert an hour rather than one an invoice.
     */
    private function configureRealtimeAlerts(): void
    {
        Exceptions::reportable(function (PusherException $e) {
            Log::warning('Realtime broadcast failed', ['error' => $e->getMessage()]);

            app(DiscordWebhookService::class)->sendAlertOnce(
                'realtime:broadcast',
                'Push realtime gagal: '.$e->getMessage().' — klien memakai polling cadangan.'
            );
        });
    }

    /**
     * Storefront URLs address a game by slug, but `categories.slug` is nullable
     * on rows created before it existed and the admin panel links by `code`.
     * Binding through Catalog::resolveGame accepts slug, code or id so no game
     * is unreachable, and it filters inactive games out at the routing layer.
     */
    private function configureRouteBindings(): void
    {
        Route::bind('game', function (string $value) {
            return Catalog::resolveGame($value) ?? abort(404, 'Game tidak ditemukan.');
        });
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(120)->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('checkout', function (Request $request) {
            return Limit::perMinute(10)->by($request->user()?->id ?: $request->ip());
        });

        // Looser than checkout on purpose: the checkout screen re-checks the item
        // every time a buyer picks a package, and sharing checkout's 10/minute
        // would spend the checkout budget just by browsing.
        RateLimiter::for('recheck', function (Request $request) {
            return Limit::perMinute(30)->by($request->user()?->id ?: $request->ip());
        });

        // Generous on purpose: legitimate gateway retry bursts must never be
        // dropped — signature verification is the real gate on these routes.
        RateLimiter::for('webhooks', function (Request $request) {
            return Limit::perMinute(120)->by($request->ip());
        });

        // Two limits, not one. Keyed on the email as well as the IP because a
        // shared office egresses through a single address: five colleagues
        // signing in at 09:00 used to exhaust the whole allowance, and since
        // /register, /forgot-password and /reset-password share this limiter it
        // locked out password recovery for everyone behind that IP too.
        //
        // The per-email limit is the one that actually stops credential
        // stuffing against an account; the per-IP ceiling is the loose backstop
        // against a single host hammering many accounts.
        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower(trim((string) $request->input('email')));

            return [
                Limit::perMinute(5)->by($email.'|'.$request->ip()),
                Limit::perMinute(30)->by($request->ip()),
            ];
        });

        // Second-factor verification. Keyed on the challenge, not the IP: a
        // per-IP limit is useless against distributed guessing and harmful in a
        // shared office. The real control is the per-challenge attempt counter
        // — this is the backstop against hammering one challenge.
        RateLimiter::for('two-factor', function (Request $request) {
            $challenge = (string) $request->input('challenge_token');

            return Limit::perMinute(10)->by($challenge !== '' ? hash('sha256', $challenge) : $request->ip());
        });

        // Public refund claim. Tighter than checkout because the prize is
        // different: this surface decides where money is sent, so a scripted
        // sweep of invoice/contact pairs must die early. A real customer needs
        // two or three requests, not six.
        RateLimiter::for('refund-claim', function (Request $request) {
            return Limit::perMinute(6)->by($request->ip());
        });

        // Hub money-path writes: one caller (the Hub) driving a human's clicks,
        // so a modest ceiling — enough for real review bursts, tight enough to
        // blunt a leaked-write-key abuse window.
        RateLimiter::for('hub-write', function (Request $request) {
            return Limit::perMinute(30)->by($request->ip());
        });

        // Discord's own ceiling is roughly thirty messages a minute per webhook.
        // Every activity notification goes through SendDiscordActivityJob, and
        // this is what stops a busy hour from turning into a 429 storm that
        // Discord answers by dropping the messages. One shared budget, because
        // there is one webhook.
        RateLimiter::for('discord', function () {
            return Limit::perMinute(25)->by('activity');
        });

        // Config-sync pokes from the Hub. One caller, and the job behind it is
        // unique-for-60s anyway, so this only has to blunt a loop — a panel
        // save burst of a dozen in a minute is normal and must pass.
        RateLimiter::for('hub-sync', function (Request $request) {
            return Limit::perMinute(12)->by($request->ip());
        });

        // The Hub asking for a LIVE gateway balance. Every call reaches
        // Monetapay, whose inquiry takes up to 15 seconds, so this is sized for
        // an hourly sweep plus an operator pressing "Perbarui" — not for
        // anything that polls. The figure is cached here for a minute anyway, so
        // a faster caller would only get the same number back.
        RateLimiter::for('hub-balance', function (Request $request) {
            return Limit::perMinute(6)->by($request->ip());
        });
    }
}
