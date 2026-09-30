<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\Admin\WebsiteSubscriptionController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\Auth\TwoFactorController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BannerController;
use App\Http\Controllers\Api\Category\CategoryController;
use App\Http\Controllers\Api\Category\CategoryTypeController;
use App\Http\Controllers\Api\Category\ServerCategoryController;
use App\Http\Controllers\Api\Category\ServerCategoryOptionController;
use App\Http\Controllers\Api\Category\SubCategoryController;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\Content\ArticleCategoryController;
use App\Http\Controllers\Api\Content\ArticleController;
use App\Http\Controllers\Api\Content\FaqController;
use App\Http\Controllers\Api\Content\PageController;
use App\Http\Controllers\Api\Content\SettingController;
use App\Http\Controllers\Api\Content\TestimonialController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\Finance\ChannelFeeController;
use App\Http\Controllers\Api\Finance\FinanceDashboardController;
use App\Http\Controllers\Api\Finance\FinanceMerchantController;
use App\Http\Controllers\Api\Finance\FinanceTransactionController;
use App\Http\Controllers\Api\Finance\FinanceWithdrawalController;
use App\Http\Controllers\Api\Finance\NotificationController;
use App\Http\Controllers\Api\Finance\ServiceController;
use App\Http\Controllers\Api\Finance\ServiceIncidentController;
use App\Http\Controllers\Api\Finance\ServiceInstallationController;
use App\Http\Controllers\Api\Finance\ServiceInstallationDetailController;
use App\Http\Controllers\Api\Finance\ServiceInstallationStepController;
use App\Http\Controllers\Api\Finance\ServiceInvoiceController;
use App\Http\Controllers\Api\Finance\ServiceSubscriptionController;
use App\Http\Controllers\Api\FinancialController;
use App\Http\Controllers\Api\Hub\HubActionController;
use App\Http\Controllers\Api\Hub\HubInstallationController;
use App\Http\Controllers\Api\Hub\HubReportController;
use App\Http\Controllers\Api\Hub\HubSyncTriggerController;
use App\Http\Controllers\Api\IntegrationController;
use App\Http\Controllers\Api\LeaderboardController;
use App\Http\Controllers\Api\Marketing\FlashSaleController;
use App\Http\Controllers\Api\Marketing\PromoController;
use App\Http\Controllers\Api\Member\ApiCredentialController;
use App\Http\Controllers\Api\Member\BalanceTopupController;
use App\Http\Controllers\Api\Member\MemberActivityLogController;
use App\Http\Controllers\Api\Member\MemberPointController;
use App\Http\Controllers\Api\Member\MemberRefundController;
use App\Http\Controllers\Api\Member\MembershipController;
use App\Http\Controllers\Api\Member\MemberTransactionController;
use App\Http\Controllers\Api\Member\ProfileController;
use App\Http\Controllers\Api\Membership\MembershipPlanController;
use App\Http\Controllers\Api\Merchant\MerchantDashboardController;
use App\Http\Controllers\Api\Merchant\MerchantMutationController;
use App\Http\Controllers\Api\Merchant\MerchantServiceController;
use App\Http\Controllers\Api\Merchant\MerchantServiceInstallationController;
use App\Http\Controllers\Api\Merchant\MerchantServiceInvoiceController;
use App\Http\Controllers\Api\Merchant\MerchantTransactionController;
use App\Http\Controllers\Api\Merchant\ServiceStatusController;
use App\Http\Controllers\Api\Merchant\WithdrawalController as MerchantWithdrawalController;
use App\Http\Controllers\Api\Payment\Monetapay\DisbursementCallbackController;
use App\Http\Controllers\Api\Payment\Monetapay\MonetapayCallbackController;
use App\Http\Controllers\Api\Payment\Monetapay\MonetapayController;
use App\Http\Controllers\Api\Payment\Monetapay\MonetapaySubscriptionCallbackController;
use App\Http\Controllers\Api\Payment\PaymentChannelController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PointHistoryController;
use App\Http\Controllers\Api\Pricing\PricingRuleController;
use App\Http\Controllers\Api\Product\ProductController;
use App\Http\Controllers\Api\Product\SupplierProductController;
use App\Http\Controllers\Api\RatingController;
use App\Http\Controllers\Api\Refund\RefundClaimController;
use App\Http\Controllers\Api\Refund\RefundController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\Storefront\ArticleController as StorefrontArticleController;
use App\Http\Controllers\Api\Storefront\ContentController;
use App\Http\Controllers\Api\Storefront\ContentPageController;
use App\Http\Controllers\Api\Storefront\GameController as StorefrontGameController;
use App\Http\Controllers\Api\Storefront\GameReviewController;
use App\Http\Controllers\Api\Storefront\GuestRatingController;
use App\Http\Controllers\Api\Storefront\InvoiceController;
use App\Http\Controllers\Api\Storefront\InvoiceDownloadController;
use App\Http\Controllers\Api\Storefront\LeaderboardController as StorefrontLeaderboardController;
use App\Http\Controllers\Api\Storefront\MarketingController;
use App\Http\Controllers\Api\Storefront\OrderTrackController;
use App\Http\Controllers\Api\Storefront\PaymentChannelController as StorefrontPaymentChannelController;
use App\Http\Controllers\Api\Storefront\PayoutBankController;
use App\Http\Controllers\Api\Storefront\PriceListController;
use App\Http\Controllers\Api\Storefront\ValidateGameIdController;
use App\Http\Controllers\Api\Supplier\SupplierCategoryController;
use App\Http\Controllers\Api\Supplier\SupplierController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\User\SyncTimezoneController;
use App\Http\Controllers\Api\User\UpdateLocaleController;
use App\Http\Controllers\Api\User\UserController;
use App\Http\Controllers\Api\Uxiolabs\PriceChangeLogController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsBalanceController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsCategoryController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsPoolController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsPriceListController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsProductController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsProductImportController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsSkuLookupController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsSyncController;
use App\Http\Controllers\Api\Uxiolabs\UxiolabsTransactionStatusController;
use App\Http\Controllers\Api\Uxiolabs\WebhookUxiolabsController;
use App\Http\Controllers\Api\VersionController;
use App\Http\Resources\User\UserResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// All Public Routes under v1
Route::prefix('v1')->group(function () {

    // System Routes
    Route::get('/ping', function () {
        return response()->json(['status' => 'success', 'message' => 'pong']);
    });

    Route::get('/health', fn () => response()->json([
        'status' => 'success',
        'message' => 'ok',
        'ping_ms' => (int) round((microtime(true) - LARAVEL_START) * 1000),
    ]));

    // What this deployment is running — version, commit, the template release
    // it came from, and the Hub contract it speaks. Read by the Hub and by an
    // operator; see VersionController for why it stays open while the site is
    // switched off.
    Route::get('/version', VersionController::class);

    // Payment Webhooks (No Auth Required) — throttled per IP; the real gate is
    // signature verification inside each controller.
    Route::middleware('throttle:webhooks')->group(function () {
        Route::post('/payment/callback', MonetapayCallbackController::class);
        // Method-specific Monetapay callbacks — same decrypt+verify+dispatch flow.
        // Point Monetapay's VA/E-Wallet/QRIS callback URLs at whichever you prefer.
        Route::post('/monetapay/va/callback', MonetapayCallbackController::class);
        Route::post('/monetapay/ewallet/callback', MonetapayCallbackController::class);
        Route::post('/monetapay/qris/callback', MonetapayCallbackController::class);
        // Subscription lifecycle callbacks (EVT_ACTIVE/EVT_INACTIVE/EVT_CYCLE_PREV_TRIGGER/EVT_CYCLE_TRIGGERED)
        Route::post('/monetapay/subscription/callback/active', [MonetapaySubscriptionCallbackController::class, 'active']);
        Route::post('/monetapay/subscription/callback/deduct/before', [MonetapaySubscriptionCallbackController::class, 'beforeDeduct']);
        Route::post('/monetapay/subscription/callback/deduct/after', [MonetapaySubscriptionCallbackController::class, 'afterDeduct']);
        Route::post('/uxiolabs/callback', [WebhookUxiolabsController::class, 'handle']);
        // Legacy path, kept alive on purpose: the callback URL is sent to the
        // supplier on every /order, so orders placed before the rename are
        // still holding this one. Remove it once none of those can be open.
        Route::post('/uxiotopup/callback', [WebhookUxiolabsController::class, 'handle']);
        // Payout (disbursement) result callback (7.4.2) — drives a withdrawal to
        // SETTLED/FAILED. Point Monetapay's disbursement callback URL here.
        Route::post('/disbursement/merchant/callback', DisbursementCallbackController::class);
    });

    // ── Public storefront ────────────────────────────────────────────────
    // Read-only catalog consumed by the customer-facing SPA. Anonymous, but
    // each handler reads the bearer token when one is present so a signed-in
    // member is quoted their own tier price.
    Route::get('/games', [StorefrontGameController::class, 'index']);
    Route::get('/games/{game}', [StorefrontGameController::class, 'show']);
    Route::get('/games/{game}/products', [StorefrontGameController::class, 'products']);
    Route::get('/games/{game}/reviews', [GameReviewController::class, 'index']);
    // Throttled: keeps third-party nickname lookups from being hammered
    // from the client.
    Route::post('/games/{game}/validate-id', ValidateGameIdController::class)->middleware('throttle:checkout');

    Route::get('/price-list', [PriceListController::class, 'index']);

    // These three resources already exist as admin endpoints at /v1/banners,
    // /v1/announcements and /v1/leaderboard. Laravel's route collection is keyed
    // on method+uri, so registering a public route on the same path would
    // silently replace the admin one (or be replaced by it, depending on order)
    // and break the admin dashboard. The public reads therefore live under their
    // own prefix — different audience, different projection, different route.
    Route::prefix('storefront')->group(function () {
        Route::get('/banners', [ContentController::class, 'banners']);
        Route::get('/announcements', [ContentController::class, 'announcements']);
        Route::get('/leaderboard', [StorefrontLeaderboardController::class, 'index']);

        // CMS reads. Prefixed for the same reason as the three above: the
        // admin group already owns /v1/articles, /v1/faqs and /v1/pages, and
        // Laravel keys the route collection on method+uri — a same-path public
        // route would silently replace the admin one.
        Route::get('/articles', [StorefrontArticleController::class, 'index']);
        Route::get('/article-categories', [StorefrontArticleController::class, 'categories']);
        Route::get('/articles/{slug}', [StorefrontArticleController::class, 'show']);
        Route::get('/faqs', [ContentPageController::class, 'faqs']);
        Route::get('/testimonials', [ContentPageController::class, 'testimonials']);
        Route::get('/settings', [ContentPageController::class, 'settings']);
        Route::get('/pages/{slug}', [ContentPageController::class, 'page']);

        // Relocated from /v1/payment-channels so the admin group can own that
        // URI: Laravel keys routes on method+uri, and the admin group is
        // registered last, so it would have silently swallowed the public read.
        Route::get('/payment-channels', [StorefrontPaymentChannelController::class, 'index']);

        Route::get('/flash-sale', [MarketingController::class, 'flashSale']);
        Route::get('/promos', [MarketingController::class, 'promos']);
        Route::get('/membership-plans', [MembershipController::class, 'plans']);
    });

    // Takes a guessable code, so it is throttled like checkout rather than
    // left on the global limiter — otherwise codes are brute-forceable.
    Route::middleware('throttle:checkout')->group(function () {
        Route::post('/storefront/promos/validate', [MarketingController::class, 'validatePromo']);
    });

    // Receipt lookup. Invoice numbers carry six random characters, so they are
    // not enumerable; the projection is narrow regardless — see InvoiceController.
    // Static `/download` before the `{invoiceNumber}` read so it isn't shadowed.
    Route::get('/invoices/{invoiceNumber}/download', InvoiceDownloadController::class);
    Route::get('/invoices/{invoiceNumber}', InvoiceController::class);

    Route::middleware('throttle:checkout')->group(function () {
        Route::post('/checkout', [CheckoutController::class, 'store']);

        // Takes a phone number as input, so it is throttled like checkout
        // rather than left on the global limiter.
        Route::get('/orders/track', OrderTrackController::class);

        // Guest feedback: reviews a guest's own completed order by invoice number
        // (the member equivalent is POST /v1/me/transactions/{invoiceNumber}/rating).
        // Throttled like checkout since the invoice number is the only credential.
        Route::post('/transactions/{invoiceNumber}/rating', [GuestRatingController::class, 'store']);
    });

    // Payout destinations for every refund/withdrawal form. Public: a static
    // list of banks with nothing sensitive in it, and the guest claim page is
    // unauthenticated.
    Route::get('/payout-banks', PayoutBankController::class);

    // Guest refund claim. Prefixed `refund-claims` on purpose: the admin queue
    // lives at /v1/refunds/*, and Laravel's route collection is keyed on
    // method+uri, so sharing that namespace would let a public route silently
    // replace an admin one. The emailed token is the credential.
    Route::middleware('throttle:refund-claim')->prefix('refund-claims')->group(function () {
        Route::post('/resend', [RefundClaimController::class, 'resend']);
        Route::get('/{claimToken}', [RefundClaimController::class, 'show']);
        Route::post('/{claimToken}/payout-details', [RefundClaimController::class, 'submitPayoutDetails']);

        // Claiming the refund with an account, which is how a guest is repaid
        // now. Two endpoints rather than one optional-auth endpoint: the bodies
        // are disjoint, and a single route would let an expired Bearer token
        // fall through to "register" and fail on a duplicate email instead of
        // telling the customer their session lapsed.
        Route::post('/{claimToken}/register', [RefundClaimController::class, 'register']);
        Route::post('/{claimToken}/attach', [RefundClaimController::class, 'attach'])
            ->middleware('auth:sanctum');
    });

    // Authentication Routes
    Route::prefix('auth')->group(function () {
        Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('/google', [AuthController::class, 'google'])->middleware('throttle:login');
        // Throttled like every other unauthenticated auth route. Without a
        // limiter this is an unmetered token-guessing oracle.
        Route::post('/refresh', [AuthController::class, 'refreshToken'])->middleware('throttle:api');

        // Self-service signup and password recovery. Both are throttled per IP
        // like login: they take an email address and would otherwise be a free
        // account-enumeration and mail-flood surface.
        Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:login');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:login');
        Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:login');

        // Unauthenticated on purpose: the caller has proved a password but
        // holds no session, and the challenge token is the only thing that
        // gets them further.
        Route::post('/2fa/verify', [TwoFactorController::class, 'verify'])->middleware('throttle:two-factor');

        Route::middleware(['auth:sanctum', 'abilities:access-api'])->group(function () {
            Route::post('/logout', [AuthController::class, 'logout']);

            // Enrolment sits outside the admin group deliberately: an admin
            // mid-setup is refused by `two-factor`, so guarding these with it
            // would leave them nowhere to go.
            Route::post('/2fa/setup', [TwoFactorController::class, 'setup']);
            Route::post('/2fa/confirm', [TwoFactorController::class, 'confirm']);
            Route::post('/2fa/disable', [TwoFactorController::class, 'disable']);

            // Moving the authenticator to another device. Throttled like the
            // login challenge: `rotate` takes a TOTP code, so it is somewhere
            // a hijacked session could sit and guess.
            Route::post('/2fa/rotate', [TwoFactorController::class, 'rotate'])->middleware('throttle:two-factor');
            Route::post('/2fa/rotate/confirm', [TwoFactorController::class, 'confirmRotation'])->middleware('throttle:two-factor');
        });
    });
});

// Protected Routes (Requires Auth)
//
// `abilities:access-api` is not decoration. `auth:sanctum` alone accepts ANY
// unexpired personal access token regardless of what it was minted for — so
// without this the 30-day `refresh_token` (abilities `['issue-access-token']`)
// is a full API session, and the admin panel keeps it in a JS-readable cookie.
// The ability check is what makes the refresh token exchangeable-only.
//
// Every new protected group must carry it.
Route::prefix('v1')->middleware(['auth:sanctum', 'abilities:access-api'])->group(function () {

    // User Info (Current Auth User) — any authenticated user, not admin-only
    Route::get('/user', function (Request $request) {
        return response()->json([
            'status' => 'success',
            'code' => 200,
            'message' => 'Success',
            // Role eager-loaded so UserResource emits it — the storefront routes
            // its member/admin guards off that value.
            'data' => new UserResource($request->user()->load('role')),
        ]);
    });

    Route::patch('/users/sync-timezone', SyncTimezoneController::class);

    // ── Member self-service ──────────────────────────────────────────────
    // Everything the signed-in customer can see or change about themselves.
    // Scoped to the caller inside each action — never admin-wide.
    Route::prefix('me')->group(function () {
        Route::get('/', [ProfileController::class, 'show']);
        // The language this account reads the platform in. Stored server-side
        // so the choice follows the person to a new device, which is the one
        // thing each panel's localStorage cannot do.
        Route::patch('/locale', UpdateLocaleController::class);
        Route::put('/', [ProfileController::class, 'update']);
        Route::put('/password', [ProfileController::class, 'updatePassword']);

        Route::get('/dashboard', [MemberTransactionController::class, 'dashboard']);
        Route::get('/transactions', [MemberTransactionController::class, 'index']);
        // Keyed on invoice_number — the only order identifier the storefront
        // ever holds — and resolved inside the caller's own transactions.
        Route::post('/transactions/{invoiceNumber}/rating', [MemberTransactionController::class, 'rate']);

        Route::get('/activity-logs', [MemberActivityLogController::class, 'index']);

        // ── Wallet ───────────────────────────────────────────────────────
        // Creating a top-up opens a real payment, so it is throttled like
        // checkout rather than left on the global limiter.
        Route::get('/topups', [BalanceTopupController::class, 'index']);
        Route::post('/topups', [BalanceTopupController::class, 'store'])->middleware('throttle:checkout');
        Route::get('/topups/{reference}', [BalanceTopupController::class, 'show']);
        Route::get('/balance-mutations', [BalanceTopupController::class, 'mutations']);

        // ── Points ───────────────────────────────────────────────────────
        // A statement, not just a number: points move on completed orders and
        // on refunds, and a balance that changes with no line behind it looks
        // like a bug.
        Route::get('/points', [MemberPointController::class, 'summary']);
        Route::get('/point-history', [MemberPointController::class, 'history']);
        // Refunds this account claimed. Not in /me/transactions, because a
        // claim never rewrites `transactions.user_id` — see the controller.
        Route::get('/refunds', [MemberRefundController::class, 'index']);

        // ── Membership ───────────────────────────────────────────────────
        Route::get('/membership', [MembershipController::class, 'current']);
        Route::patch('/membership/auto-renew', [MembershipController::class, 'setAutoRenew']);
        Route::post('/membership/subscribe', [MembershipController::class, 'subscribe'])
            ->middleware('throttle:checkout');

        // ── Integration credentials ──────────────────────────────────────
        Route::get('/api-credentials', [ApiCredentialController::class, 'index']);
        Route::post('/api-credentials', [ApiCredentialController::class, 'store']);
        Route::put('/api-credentials/{apiCredential}', [ApiCredentialController::class, 'update']);
        Route::post('/api-credentials/{apiCredential}/regenerate', [ApiCredentialController::class, 'regenerate']);
        Route::delete('/api-credentials/{apiCredential}', [ApiCredentialController::class, 'destroy']);
    });
});

// Admin-only management API (requires auth:sanctum + the admin role — see EnsureUserIsAdmin)
Route::prefix('v1')->middleware(['auth:sanctum', 'abilities:access-api', 'admin', 'two-factor'])->group(function () {

    // This site's own subscription to the platform, for the sidebar footer.
    // Rendered on every admin page, so it always answers 200.
    Route::get('/website-subscription', [WebsiteSubscriptionController::class, 'show']);

    // In-app notifications for this admin. Same controller as the other two
    // panels: every query is scoped to `$request->user()->id` before any
    // filter, so the route group decides who may ask, never whose rows come
    // back. Admins already had rows written for them (a refund claim raises
    // one) with no route to read them.
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    // CRUD Users
    Route::prefix('users')->group(function () {
        Route::get('/', [UserController::class, 'index']);
        Route::post('/', [UserController::class, 'store']);
        Route::get('/{user}', [UserController::class, 'show']);
        // The user-detail read side: aggregates plus the threads an operator
        // follows from one account. Read-only, and admin-gated like the rest.
        Route::get('/{user}/overview', [UserController::class, 'overview']);
        Route::get('/{user}/balance-mutations', [UserController::class, 'balanceMutations']);
        Route::get('/{user}/point-history', [UserController::class, 'pointHistory']);
        Route::get('/{user}/refunds', [UserController::class, 'refunds']);
        Route::put('/{user}', [UserController::class, 'update']);
        Route::delete('/{user}', [UserController::class, 'destroy']);
        // Admin moderation + audited wallet adjustment (money-moving, so a
        // reason is required and the write goes through WalletLedger).
        Route::post('/{user}/status', [UserController::class, 'setStatus']);
        Route::post('/{user}/balance-adjustments', [UserController::class, 'adjustBalance']);
    });

    // Dashboard (admin overview aggregates)
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);
    Route::get('/dashboard/performance', [DashboardController::class, 'performance']);

    // Financial Summary
    Route::get('/financial/summary', [FinancialController::class, 'summary']);
    Route::get('/financial/payment-gateways', [FinancialController::class, 'paymentGateways']);
    Route::get('/financial/suppliers', [FinancialController::class, 'suppliers']);

    // Reporting hub (consolidated revenue/transactions/profit + breakdown)
    Route::get('/reports/summary', [ReportController::class, 'summary']);

    // Integration channel connectivity overview + per-channel manage
    Route::get('/integration/channels', [IntegrationController::class, 'channels']);
    Route::get('/integration/channels/{provider}', [IntegrationController::class, 'show']);
    Route::put('/integration/channels/{provider}', [IntegrationController::class, 'update']);
    Route::post('/integration/channels/{provider}/ping', [IntegrationController::class, 'ping']);

    // Activity Logs
    Route::get('/activity-logs', [ActivityLogController::class, 'index']);

    // Leaderboard
    Route::get('/leaderboard', [LeaderboardController::class, 'index']);

    // Master Data: Categories
    Route::prefix('category-types')->group(function () {
        Route::get('/', [CategoryTypeController::class, 'index']);
        Route::post('/', [CategoryTypeController::class, 'store']);
        Route::get('/{categoryType}', [CategoryTypeController::class, 'show']);
        Route::put('/{categoryType}', [CategoryTypeController::class, 'update']);
        Route::delete('/{categoryType}', [CategoryTypeController::class, 'destroy']);
    });

    Route::prefix('categories')->group(function () {
        Route::get('/', [CategoryController::class, 'index']);
        Route::post('/', [CategoryController::class, 'store']);
        Route::get('/{category}', [CategoryController::class, 'show']);
        Route::put('/{category}', [CategoryController::class, 'update']);
        Route::post('/{category}/status', [CategoryController::class, 'setStatus']);
        Route::delete('/{category}', [CategoryController::class, 'destroy']);
    });

    Route::prefix('sub-categories')->group(function () {
        Route::get('/', [SubCategoryController::class, 'index']);
        Route::post('/', [SubCategoryController::class, 'store']);
        Route::get('/{subCategory}', [SubCategoryController::class, 'show']);
        Route::put('/{subCategory}', [SubCategoryController::class, 'update']);
        Route::delete('/{subCategory}', [SubCategoryController::class, 'destroy']);
    });

    Route::prefix('server-categories')->group(function () {
        Route::get('/', [ServerCategoryController::class, 'index']);
        Route::post('/', [ServerCategoryController::class, 'store']);
        Route::get('/{serverCategory}', [ServerCategoryController::class, 'show']);
        Route::put('/{serverCategory}', [ServerCategoryController::class, 'update']);
        Route::delete('/{serverCategory}', [ServerCategoryController::class, 'destroy']);
    });

    Route::prefix('server-category-options')->group(function () {
        Route::get('/', [ServerCategoryOptionController::class, 'index']);
        Route::post('/', [ServerCategoryOptionController::class, 'store']);
        Route::get('/{serverCategoryOption}', [ServerCategoryOptionController::class, 'show']);
        Route::put('/{serverCategoryOption}', [ServerCategoryOptionController::class, 'update']);
        Route::delete('/{serverCategoryOption}', [ServerCategoryOptionController::class, 'destroy']);
    });

    // Master Data: Suppliers & Products
    Route::prefix('suppliers')->group(function () {
        Route::get('/', [SupplierController::class, 'index']);
        Route::post('/', [SupplierController::class, 'store']);
        Route::get('/{supplier}', [SupplierController::class, 'show']);
        Route::put('/{supplier}', [SupplierController::class, 'update']);
        Route::delete('/{supplier}', [SupplierController::class, 'destroy']);
    });

    Route::prefix('supplier-categories')->group(function () {
        Route::get('/', [SupplierCategoryController::class, 'index']);
        Route::post('/', [SupplierCategoryController::class, 'store']);
        Route::get('/{supplierCategory}', [SupplierCategoryController::class, 'show']);
        Route::put('/{supplierCategory}', [SupplierCategoryController::class, 'update']);
        Route::delete('/{supplierCategory}', [SupplierCategoryController::class, 'destroy']);
    });

    Route::prefix('products')->group(function () {
        Route::get('/', [ProductController::class, 'index']);
        Route::post('/', [ProductController::class, 'store']);
        // Bulk routes precede the {product} binding so "bulk" is never a model key.
        Route::post('/bulk-create', [ProductController::class, 'bulkCreate']);
        Route::post('/bulk/show-price', [ProductController::class, 'bulkShowPrice']);
        Route::post('/bulk/publish', [ProductController::class, 'bulkPublish']);
        Route::post('/bulk/uxiolabs-update', [ProductController::class, 'bulkUxiolabsUpdate']);
        Route::post('/bulk/delete', [ProductController::class, 'bulkDelete']);
        // Add Products ▸ From Supplier: provider SKUs become draft products.
        // Precedes the {product} binding for the same reason the bulk routes do.
        Route::post('/from-supplier', [ProductController::class, 'fromSupplier']);
        Route::get('/{product}', [ProductController::class, 'show']);
        Route::put('/{product}', [ProductController::class, 'update']);
        Route::delete('/{product}', [ProductController::class, 'destroy']);
        // Listis / Unlistis — the only lifecycle verbs on the products page.
        Route::post('/{product}/publish', [ProductController::class, 'publish']);
        Route::post('/{product}/unpublish', [ProductController::class, 'unpublish']);
        Route::post('/{product}/profit-margin', [ProductController::class, 'setMargin']);
        Route::post('/{product}/price-limit', [ProductController::class, 'setPriceLimit']);
        // withTrashed: the target is archived by definition, so the default
        // binding — which applies the soft-delete scope — would 404 every time.
        Route::post('/{product}/restore', [ProductController::class, 'restore'])->withTrashed();
    });

    Route::prefix('supplier-products')->group(function () {
        Route::get('/', [SupplierProductController::class, 'index']);
        Route::post('/', [SupplierProductController::class, 'store']);
        // Bulk routes precede the {supplierProduct} binding so "bulk" is never
        // resolved as a model key.
        Route::post('/bulk/lock-price', [SupplierProductController::class, 'bulkLockPrice']);
        Route::post('/bulk/profit-margin', [SupplierProductController::class, 'bulkSetMargin']);
        Route::post('/bulk/delete', [SupplierProductController::class, 'bulkDelete']);
        // Pool pipeline: a priced pool row becomes a DRAFT product, and publishing
        // it is a separate, deliberate act.
        Route::post('/bulk/promote', [SupplierProductController::class, 'bulkPromote']);
        Route::post('/bulk/publish', [SupplierProductController::class, 'bulkPublish']);
        // Onboarding shortcut: promote and publish without a round trip through
        // the Main Products list.
        Route::post('/bulk/promote-publish', [SupplierProductController::class, 'bulkPromoteAndPublish']);
        Route::get('/{supplierProduct}', [SupplierProductController::class, 'show']);
        Route::put('/{supplierProduct}', [SupplierProductController::class, 'update']);
        Route::delete('/{supplierProduct}', [SupplierProductController::class, 'destroy']);
        Route::post('/{supplierProduct}/lock-price', [SupplierProductController::class, 'lockPrice']);
        Route::post('/{supplierProduct}/profit-margin', [SupplierProductController::class, 'setMargin']);
        Route::post('/{supplierProduct}/promote', [SupplierProductController::class, 'promote']);
        Route::post('/{supplierProduct}/publish', [SupplierProductController::class, 'publish']);
    });

    // Pricing Rules (markup config used by the uxiolabs price sync)
    Route::apiResource('pricing-rules', PricingRuleController::class);

    // Membership plans (loyalty tiers) — admin CRUD; storefront reads its own
    // GET /v1/storefront/membership-plans.
    Route::apiResource('membership-plans', MembershipPlanController::class);

    // ── Content & marketing ──────────────────────────────────────────────
    // article-categories is registered before articles so neither shadows the
    // other, and both keep their own {id} binding.
    Route::apiResource('article-categories', ArticleCategoryController::class);
    Route::apiResource('articles', ArticleController::class);
    Route::apiResource('faqs', FaqController::class);
    Route::apiResource('pages', PageController::class);
    Route::apiResource('testimonials', TestimonialController::class);
    Route::apiResource('payment-channels', PaymentChannelController::class);
    Route::apiResource('flash-sales', FlashSaleController::class);
    Route::get('/promos/{promo}/redemptions', [PromoController::class, 'redemptions']);
    Route::apiResource('promos', PromoController::class);

    // Settings are one grouped form, not a table: a flat read plus a bulk write.
    Route::get('/settings', [SettingController::class, 'index']);
    Route::put('/settings', [SettingController::class, 'update']);
    Route::post('/settings/upload', [SettingController::class, 'upload']);

    // Uxiolabs Admin Tools
    Route::get('/uxiolabs/balance', [UxiolabsBalanceController::class, 'index']);
    Route::post('/uxiolabs/check-status', [UxiolabsTransactionStatusController::class, 'check']);
    Route::post('/uxiolabs/sync-products', [UxiolabsSyncController::class, 'sync']);

    // Uxiolabs Manual Product Management (products are never auto-created)
    // Browse the whole uxiolabs price list (Product Provider tab) — reads the
    // shared 5-min cache, so paging/searching never hits uxiolabs upstream.
    Route::get('/uxiolabs/price-list', [UxiolabsPriceListController::class, 'index']);
    // The provider's own `kategori` values, for the Category Provider dropdown.
    // Free text upstream, so offering the live list is what stops an admin
    // mapping a category that matches nothing.
    Route::get('/uxiolabs/categories', [UxiolabsCategoryController::class, 'index']);
    // The Add-panel feed: SKUs whose kategori has a configured Category Provider.
    Route::get('/uxiolabs/pool-candidates', [UxiolabsPoolController::class, 'candidates']);
    Route::get('/uxiolabs/pool-summary', [UxiolabsPoolController::class, 'summary']);
    Route::get('/uxiolabs/pool-facets', [UxiolabsPoolController::class, 'facets']);
    Route::post('/uxiolabs/pool', [UxiolabsPoolController::class, 'store']);
    Route::get('/uxiolabs/sku-preview', [UxiolabsSkuLookupController::class, 'show']);
    Route::post('/uxiolabs/products', [UxiolabsProductController::class, 'store']);
    Route::post('/uxiolabs/products/bulk', [UxiolabsProductController::class, 'bulkStore']);
    Route::get('/uxiolabs/products/import-template', [UxiolabsProductImportController::class, 'template']);
    Route::post('/uxiolabs/products/import', [UxiolabsProductImportController::class, 'import']);

    // Uxiolabs Price Change Log — read-only audit trail of what the 5-minute
    // checker auto-repriced or flagged (deactivated / negative margin).
    Route::get('/uxiolabs/price-change-logs', [PriceChangeLogController::class, 'index']);

    // Monetapay Admin / Test Tools — inquiries (read-only) + cancel/refund.
    // Outbound signed calls to Monetapay; mirror the spec's query endpoints.
    Route::prefix('monetapay')->group(function () {
        Route::post('/balance', [MonetapayController::class, 'balance']);              // 5.1
        Route::post('/virtual-account/query', [MonetapayController::class, 'virtualAccount']);      // 6.1.2
        Route::post('/ewallet/query', [MonetapayController::class, 'ewallet']);             // 6.2.2
        Route::post('/qris/query', [MonetapayController::class, 'qris']);                // 6.3.3
        Route::post('/payment-link/create', [MonetapayController::class, 'paymentLinkCreate']);    // 6.4.1
        Route::post('/payment-link/query', [MonetapayController::class, 'paymentLink']);         // 6.4.2
        Route::post('/customer/create', [MonetapayController::class, 'customerCreate']);      // 6.5.1
        Route::post('/customer/update', [MonetapayController::class, 'customerUpdate']);      // 6.5.2
        Route::post('/customer/query', [MonetapayController::class, 'customerQuery']);       // 6.5.3
        Route::post('/subscription/apply', [MonetapayController::class, 'subscriptionApply']);   // 6.5.4
        Route::post('/subscription/create', [MonetapayController::class, 'subscriptionCreate']); // (legacy create)
        Route::post('/subscription/deactivate', [MonetapayController::class, 'subscriptionDeactivate']); // 6.5.6
        Route::post('/subscription/query', [MonetapayController::class, 'subscription']);        // 6.5.5
        Route::post('/subscription/cycle', [MonetapayController::class, 'subscriptionCycle']);   // 6.5.7
        Route::post('/subscription/cycle/attempt', [MonetapayController::class, 'subscriptionCycleAttempt']); // 6.5.8
        Route::post('/refund/query', [MonetapayController::class, 'refundQuery']);         // 6.6.4
        Route::post('/repay/query', [MonetapayController::class, 'repay']);               // 6.6.5
        Route::post('/sub-merchant/query', [MonetapayController::class, 'subMerchant']);         // 6.7.4
        Route::post('/cross-border/query', [MonetapayController::class, 'crossBorder']);         // 6.8.2
        Route::post('/cdm/query', [MonetapayController::class, 'cdm']);                 // 6.9.2
        Route::post('/payin/query', [MonetapayController::class, 'payin']);               // 6.11.2
        Route::post('/disbursement/create', [MonetapayController::class, 'disbursementCreate']); // 7.1.1
        Route::post('/large-payout/create', [MonetapayController::class, 'largePayoutCreate']);  // 7.2.1
        Route::post('/ewallet-payout/create', [MonetapayController::class, 'ewalletPayoutCreate']); // 7.3.1
        Route::post('/disbursement/query', [MonetapayController::class, 'disbursement']);        // 7.4.1
        Route::post('/inquiry-account', [MonetapayController::class, 'accountValidation']);   // 8.1/8.2
        Route::post('/bills/daily', [MonetapayController::class, 'dailyBill']);           // 9.1
        Route::post('/bills/flow', [MonetapayController::class, 'billFlow']);            // 9.2
        Route::post('/transfer/query', [MonetapayController::class, 'transferQuery']);       // 15.2
        Route::post('/permission/query', [MonetapayController::class, 'merchantPermission']);  // 16.1

        // State-changing
        Route::post('/cancel', [MonetapayController::class, 'cancel']);  // 6.6.1
        Route::post('/refund', [MonetapayController::class, 'refund']);  // 6.6.2
    });

    // Transaction Management (Admin CRUD)
    // status-counts must be registered before the apiResource's {transaction}
    // wildcard, or Laravel tries to route-model-bind "status-counts" as an id.
    Route::get('/transactions/status-counts', [TransactionController::class, 'statusCounts']);
    // Static paths before the apiResource wildcard, or "export"/"recap" would
    // route-model-bind as a {transaction} id.
    Route::get('/transactions/export', [TransactionController::class, 'export']);
    Route::get('/transactions/recap', [TransactionController::class, 'recap']);
    Route::apiResource('transactions', TransactionController::class);
    Route::post('/transactions/{transaction}/manual-review', [TransactionController::class, 'manualReview']);
    Route::post('/transactions/{transaction}/refund', [TransactionController::class, 'refund']);
    Route::post('/transactions/{transaction}/resend-callback', [TransactionController::class, 'resendCallback']);
    Route::post('/transactions/{transaction}/resend-receipt', [TransactionController::class, 'resendReceipt']);
    Route::post('/transactions/{transaction}/retry', [TransactionController::class, 'retry']);

    // Refund queue. `status-counts` before the {refundRequest} wildcard, or
    // Laravel tries to route-model-bind "status-counts" as an id.
    Route::get('/refunds/status-counts', [RefundController::class, 'statusCounts']);
    Route::get('/refunds', [RefundController::class, 'index']);
    Route::get('/refunds/{refundRequest}', [RefundController::class, 'show']);
    Route::post('/refunds/{refundRequest}/payout-details', [RefundController::class, 'payoutDetails']);
    Route::post('/refunds/{refundRequest}/process', [RefundController::class, 'process']);
    Route::post('/refunds/{refundRequest}/complete', [RefundController::class, 'complete']);
    Route::post('/refunds/{refundRequest}/reject', [RefundController::class, 'reject']);
    // Refusing the claiming *account* without refusing the refund. A separate
    // verb because the money outcomes differ: this one leaves the refund owed
    // and re-claimable, `reject` closes it for good.
    Route::post('/refunds/{refundRequest}/reject-claim', [RefundController::class, 'rejectClaim']);

    // Payment Management
    Route::get('/payments', [PaymentController::class, 'index']);
    Route::post('/payments', [PaymentController::class, 'store']);
    Route::get('/payments/{payment}', [PaymentController::class, 'show']);
    Route::put('/payments/{payment}', [PaymentController::class, 'update']);
    Route::delete('/payments/{payment}', [PaymentController::class, 'destroy']);

    // Point History Management
    Route::get('/point-histories', [PointHistoryController::class, 'index']);
    Route::post('/point-histories', [PointHistoryController::class, 'store']);
    Route::get('/point-histories/{pointHistory}', [PointHistoryController::class, 'show']);
    Route::put('/point-histories/{pointHistory}', [PointHistoryController::class, 'update']);
    Route::delete('/point-histories/{pointHistory}', [PointHistoryController::class, 'destroy']);

    // Rating Management
    Route::get('/ratings', [RatingController::class, 'index']);
    Route::post('/ratings', [RatingController::class, 'store']);
    Route::get('/ratings/{rating}', [RatingController::class, 'show']);
    Route::put('/ratings/{rating}', [RatingController::class, 'update']);
    Route::delete('/ratings/{rating}', [RatingController::class, 'destroy']);

    // CMS: Banners
    Route::get('/banners', [BannerController::class, 'index']);
    Route::post('/banners', [BannerController::class, 'store']);
    Route::get('/banners/{banner}', [BannerController::class, 'show']);
    Route::put('/banners/{banner}', [BannerController::class, 'update']);
    Route::delete('/banners/{banner}', [BannerController::class, 'destroy']);

    // CMS: Announcements
    Route::get('/announcements', [AnnouncementController::class, 'index']);
    Route::post('/announcements', [AnnouncementController::class, 'store']);
    Route::get('/announcements/{announcement}', [AnnouncementController::class, 'show']);
    Route::put('/announcements/{announcement}', [AnnouncementController::class, 'update']);
    Route::delete('/announcements/{announcement}', [AnnouncementController::class, 'destroy']);
});

// ── Payment page: payment-admin ("client") ───────────────────────────────────
// The merchant's own view. Every handler additionally scopes to the caller's
// id, so the `payment-admin` gate is defence-in-depth, not the only guard.
Route::prefix('v1/payment-admin')->middleware(['auth:sanctum', 'abilities:access-api', 'payment-admin'])->group(function () {
    Route::get('/dashboard', [MerchantDashboardController::class, 'index']);

    // The client's own notifications — their subscription, their money. Scoped
    // to the caller by the controller, which is what keeps one client from
    // counting another's rows.
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    // Specific routes before the collection so /summary and /export are not
    // swallowed by a wildcard.
    Route::get('/transactions/summary', [MerchantTransactionController::class, 'summary']);
    Route::get('/transactions/export', [MerchantTransactionController::class, 'export']);
    Route::get('/transactions', [MerchantTransactionController::class, 'index']);
    Route::get('/mutations', [MerchantMutationController::class, 'index']);
    Route::get('/withdrawals', [MerchantWithdrawalController::class, 'index']);
    Route::post('/withdrawals', [MerchantWithdrawalController::class, 'store'])->middleware('throttle:checkout');
    Route::get('/withdrawals/{number}', [MerchantWithdrawalController::class, 'show']);

    // Services the client buys from kita: catalogue, own subscriptions, and
    // the invoice flow — paid through Monetapay, same gateway as checkout.
    Route::get('/services', [MerchantServiceController::class, 'catalog']);
    Route::get('/services/{service}', [MerchantServiceController::class, 'show']);
    Route::get('/service-subscriptions', [MerchantServiceController::class, 'subscriptions']);
    // The methods a client may settle a bill with. Separate from the admin
    // CRUD at /v1/payment-channels, which is payment-internal only.
    Route::get('/payment-channels', [MerchantServiceInvoiceController::class, 'paymentChannels']);
    // Everything the client is subscribed to under the Hub's plan, with the
    // next renewal date and what is outstanding — the "apa yang harus saya
    // perpanjang" surface.
    Route::get('/service-plan', [MerchantServiceController::class, 'plan']);

    // Several bills, one Monetapay attempt. The fee is charged once on the sum.
    Route::post('/service-invoices/pay-batch', [MerchantServiceInvoiceController::class, 'payBatch'])
        ->middleware('throttle:checkout');
    // A batch's QR lives on its own page, not on one of the bills it covers.
    Route::get('/service-payments/{reference}', [MerchantServiceInvoiceController::class, 'showPayment']);

    Route::get('/service-invoices', [MerchantServiceInvoiceController::class, 'index']);
    Route::post('/service-invoices', [MerchantServiceInvoiceController::class, 'store'])->middleware('throttle:checkout');
    Route::get('/service-invoices/{serviceInvoice}', [MerchantServiceInvoiceController::class, 'show']);
    // Re-open payment: a VA expires in 600s while the bill is due in days, so
    // an unpaid invoice must always be payable again.
    Route::post('/service-invoices/{serviceInvoice}/pay', [MerchantServiceInvoiceController::class, 'pay'])
        ->middleware('throttle:checkout');

    // Read-only view of kita's installation work and the credentials handed
    // over. `reveal` is POST so plaintext is neither proxy-cacheable nor
    // recorded in an access-log query string.
    Route::get('/service-subscriptions/{serviceSubscription}/installation',
        [MerchantServiceInstallationController::class, 'show']);
    Route::post('/installation-details/{serviceInstallationDetail}/reveal',
        [MerchantServiceInstallationController::class, 'reveal'])->middleware('throttle:30,1');

    // Which payment methods are disrupted and which services are closed.
    Route::get('/service-status', [ServiceStatusController::class, 'index']);
});

// ── Payment page: payment-internal ("kita") ──────────────────────────────────
// The internal team's cross-merchant view: all data, withdrawal verification,
// per-channel fee settings, and the services it sells to its clients.
Route::prefix('v1/payment-internal')->middleware(['auth:sanctum', 'abilities:access-api', 'payment-internal'])->group(function () {
    Route::get('/dashboard', [FinanceDashboardController::class, 'index']);

    // In-app notifications — one fan-out row per internal user; every query is
    // scoped to the caller. The bell polls unread-count; the page reads index.
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);

    Route::get('/merchants', [FinanceMerchantController::class, 'index']);
    Route::get('/merchants/{user}', [FinanceMerchantController::class, 'show']);
    Route::get('/transactions/summary', [FinanceTransactionController::class, 'summary']);
    Route::get('/transactions/export', [FinanceTransactionController::class, 'export']);
    Route::get('/transactions', [FinanceTransactionController::class, 'index']);
    Route::get('/withdrawals', [FinanceWithdrawalController::class, 'index']);
    // Kita's own payout request ("penarikan internal") — same table/flow as a
    // merchant withdrawal, `type=internal` on the index above lists these.
    Route::post('/withdrawals', [FinanceWithdrawalController::class, 'store'])->middleware('throttle:checkout');
    Route::get('/platform-balance', [FinanceWithdrawalController::class, 'platformBalance']);
    Route::post('/withdrawals/{withdrawal}/approve', [FinanceWithdrawalController::class, 'approve']);
    Route::post('/withdrawals/{withdrawal}/reject', [FinanceWithdrawalController::class, 'reject']);

    // Settings — biaya per metode pembayaran. That fee IS the "Biaya Admin"
    // the customer is charged; there is no separate global markup.
    Route::get('/channels', [ChannelFeeController::class, 'index']);
    // Static path before the {paymentChannel} binder. A plain read (no guard)
    // so the panel can learn it is a Hub-managed viewer and grey the inputs
    // out, instead of discovering it from a 422 after someone typed a number.
    Route::get('/channels/meta', [ChannelFeeController::class, 'channelMeta']);
    Route::put('/channels/{paymentChannel}', [ChannelFeeController::class, 'update']);

    // Services catalogue — what kita sells to its clients, and for how long.
    // Writes are refused when the catalog is Hub-managed (catalog-local):
    // a local edit would be silently overwritten by the next hub:sync-catalog.
    Route::get('/services', [ServiceController::class, 'index']);
    // Static path before the {service} wildcard, or "meta" route-model-binds as
    // an id. A plain read (no catalog-local) so the panel can learn it is a
    // Hub-managed viewer even while writes are 422'd.
    Route::get('/services/meta', [ServiceController::class, 'catalogMeta']);
    Route::post('/services', [ServiceController::class, 'store'])->middleware('catalog-local');
    Route::get('/services/{service}', [ServiceController::class, 'show']);
    Route::put('/services/{service}', [ServiceController::class, 'update'])->middleware('catalog-local');
    Route::delete('/services/{service}', [ServiceController::class, 'destroy'])->middleware('catalog-local');

    // Service bills — manual bukti-transfer verification.
    Route::get('/service-invoices', [ServiceInvoiceController::class, 'index']);
    Route::get('/service-invoices/{serviceInvoice}', [ServiceInvoiceController::class, 'show']);
    Route::post('/service-invoices/{serviceInvoice}/confirm', [ServiceInvoiceController::class, 'confirm']);
    Route::post('/service-invoices/{serviceInvoice}/reject', [ServiceInvoiceController::class, 'reject']);

    // Who subscribes to what.
    Route::get('/service-subscriptions', [ServiceSubscriptionController::class, 'index']);
    Route::get('/service-subscriptions/{serviceSubscription}', [ServiceSubscriptionController::class, 'show']);
    Route::post('/service-subscriptions/{serviceSubscription}/cancel', [ServiceSubscriptionController::class, 'cancel']);

    // Installation: the window, the milestone checklist, and the credentials.
    Route::get('/service-subscriptions/{serviceSubscription}/installation', [ServiceInstallationController::class, 'show']);
    Route::put('/service-subscriptions/{serviceSubscription}/installation', [ServiceInstallationController::class, 'upsert']);

    // The same installation, reached before confirmation so kita can prepare it
    // first. Keyed on the invoice because that is what the operator has in
    // hand; the row itself is still per (client, service).
    Route::get('/service-invoices/{serviceInvoice}/installation', [ServiceInstallationController::class, 'showForInvoice']);
    Route::put('/service-invoices/{serviceInvoice}/installation', [ServiceInstallationController::class, 'upsertForInvoice']);

    Route::post('/installations/{serviceInstallation}/steps', [ServiceInstallationStepController::class, 'store']);
    Route::put('/installation-steps/{serviceInstallationStep}', [ServiceInstallationStepController::class, 'update']);
    Route::post('/installation-steps/{serviceInstallationStep}/completion', [ServiceInstallationStepController::class, 'setCompletion']);
    Route::delete('/installation-steps/{serviceInstallationStep}', [ServiceInstallationStepController::class, 'destroy']);

    Route::post('/installations/{serviceInstallation}/detail-items', [ServiceInstallationDetailController::class, 'store']);
    Route::put('/installation-details/{serviceInstallationDetail}', [ServiceInstallationDetailController::class, 'update']);
    Route::delete('/installation-details/{serviceInstallationDetail}', [ServiceInstallationDetailController::class, 'destroy']);
    Route::post('/installation-details/{serviceInstallationDetail}/reveal',
        [ServiceInstallationController::class, 'reveal'])->middleware('throttle:60,1');

    // Incidents driving the clients' Status Layanan page.
    Route::get('/incidents', [ServiceIncidentController::class, 'index']);
    Route::post('/incidents', [ServiceIncidentController::class, 'store']);
    Route::get('/incidents/{serviceIncident}', [ServiceIncidentController::class, 'show']);
    Route::put('/incidents/{serviceIncident}', [ServiceIncidentController::class, 'update']);
    Route::delete('/incidents/{serviceIncident}', [ServiceIncidentController::class, 'destroy']);
});

// ── Hub reporting contract ───────────────────────────────────────────────────
// Read-only summaries the Uxio Hub pulls on a schedule. Gated by X-Hub-Key
// (+ optional IP allowlist) via the `hub` middleware — dead when no key is
// configured, so a standalone deployment exposes nothing. ADDITIVE-ONLY
// contract: fields may be added, never renamed or removed (sites run mixed
// deploy versions; see HubReportController).
Route::prefix('v1/hub')->middleware('hub')->group(function () {
    Route::get('/summary', [HubReportController::class, 'summary']);
    Route::get('/withdrawals', [HubReportController::class, 'withdrawals']);
    Route::get('/service-orders', [HubReportController::class, 'serviceOrders']);
    Route::get('/profit', [HubReportController::class, 'profit']);
    Route::get('/channels', [HubReportController::class, 'channels']);
    // Balance + fee + floor + bank catalogue for the Hub's internal-withdrawal
    // form. Read-only, so the read key alone is the right gate — a site with the
    // write channel off can still be looked at.
    Route::get('/withdrawal-context', [HubReportController::class, 'withdrawalContext']);
    // What this site's merchant can actually withdraw by OUR sales rules
    // (settled sales − hold − non-refunded withdrawals), beside what sits in the
    // platform account. A ledger answer, so no gateway call; additive, so a Hub
    // that does not know this route simply never asks.
    Route::get('/balances', [HubReportController::class, 'balances']);
    // What this site's owner actually holds, per service — so the Hub can answer
    // "which sites subscribe to X" from real state, not only from what it sold.
    Route::get('/subscriptions', [HubReportController::class, 'subscriptions']);
    // How far along kita is on each of this owner's installations: the window,
    // the checklist driving the progress, and the credentials (masked). Read-only
    // — the Hub sets progress through the hub-write routes below.
    Route::get('/installations', [HubReportController::class, 'installations']);
    // A LIVE sub-merchant balance inquiry, with its own limiter: every call
    // reaches a real gateway. Deliberately NOT part of /summary — that endpoint
    // refuses to make a live call because Monetapay's 15s timeout equals the
    // Hub's pull timeout and would hang every mirror.
    Route::get('/gateway-balance', [HubReportController::class, 'liveGatewayBalance'])
        ->middleware('throttle:hub-balance');
    // A LIVE Uxiotopup (supplier) balance, read with this site's own supplier
    // key. Separate from /summary for the same reason as the gateway balance
    // above: /saldo carries a 15s upstream timeout and must never sit inside the
    // five-minute mirror pull. Its own throttle bucket for the same reason.
    Route::get('/supplier-balance', [HubReportController::class, 'liveSupplierBalance'])
        ->middleware('throttle:hub-balance');
});

// ── Hub money-path WRITE channel ─────────────────────────────────────────────
// Approve/reject withdrawals from the Hub. Gated by `hub` (read key) AND
// `hub-write` (a SEPARATE write key + HUB_WRITE_ENABLED), plus a tight rate
// limit — a leaked read key must never move money. Bound by number (the Hub
// mirror keys on withdrawal_number, not the site's id). Each route wraps the
// same Action the payment-internal panel uses (HubActionController).
// ── Hub config-sync trigger ──────────────────────────────────────────────────
// "Your catalog/fee schedule changed — come and get it." Carries no data and
// moves no money: the site still fetches everything itself over its own
// outbound GET to the Hub, this only collapses the wait from a minute to a
// second. That is why it sits behind the READ key alone. Requiring the write
// key would mean a site that accepts the Hub's reports but refuses Hub-driven
// money movement (HUB_WRITE_ENABLED=false) also loses fast fee updates.
Route::prefix('v1/hub')->middleware(['hub', 'throttle:hub-sync'])->group(function () {
    Route::post('/sync', [HubSyncTriggerController::class, 'trigger']);
});

Route::prefix('v1/hub')->middleware(['hub', 'hub-write', 'throttle:hub-write'])->group(function () {
    // Raising a withdrawal has no prior row to guard on, so unlike its siblings
    // it is NOT idempotent — the Hub reconciles by re-pulling, never by retrying.
    Route::post('/internal-withdrawals', [HubActionController::class, 'createInternalWithdrawal']);
    Route::post('/withdrawals/{withdrawal:withdrawal_number}/approve', [HubActionController::class, 'approveWithdrawal']);
    Route::post('/withdrawals/{withdrawal:withdrawal_number}/reject', [HubActionController::class, 'rejectWithdrawal']);
    Route::post('/service-invoices/{serviceInvoice:invoice_number}/confirm', [HubActionController::class, 'confirmInvoice']);
    Route::post('/service-invoices/{serviceInvoice:invoice_number}/reject', [HubActionController::class, 'rejectInvoice']);

    // Installation management, driven from the Hub's Order Service detail. Not
    // money, but it writes state on this site, so it rides the same two-key
    // channel rather than widening the read key. Every route binds a row that
    // already exists — creation belongs to invoice confirmation, not the Hub.
    Route::put('/installations/{installation}', [HubInstallationController::class, 'updateWindow']);
    Route::post('/installations/{installation}/steps', [HubInstallationController::class, 'storeStep']);
    Route::put('/installation-steps/{serviceInstallationStep}', [HubInstallationController::class, 'updateStep']);
    Route::post('/installation-steps/{serviceInstallationStep}/completion', [HubInstallationController::class, 'setStepCompletion']);
    Route::delete('/installation-steps/{serviceInstallationStep}', [HubInstallationController::class, 'destroyStep']);
    Route::post('/installations/{installation}/detail-items', [HubInstallationController::class, 'storeDetail']);
    Route::put('/installation-details/{serviceInstallationDetail}', [HubInstallationController::class, 'updateDetail']);
    Route::delete('/installation-details/{serviceInstallationDetail}', [HubInstallationController::class, 'destroyDetail']);
    Route::post('/installation-details/{serviceInstallationDetail}/reveal', [HubInstallationController::class, 'revealDetail']);
});
