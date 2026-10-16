<?php

namespace App\Http\Controllers\Api\Storefront;

use App\Actions\Storefront\RecheckCheckoutItemAction;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Traits\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Is this still the price we quoted, and is it still on sale?" — asked by the
 * checkout screen the moment a buyer picks a package.
 *
 * Always answers 200 with an outcome rather than a 4xx, like the promo and
 * game-id checks before it: "the price moved" and "we could not look" are normal
 * answers a storefront has to render, not failures of the request.
 */
class RecheckCheckoutItemController extends Controller
{
    use ApiResponse;

    public function __invoke(Request $request, RecheckCheckoutItemAction $action): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
        ]);

        $product = Product::findOrFail((int) $validated['product_id']);

        // Resolved through the sanctum guard explicitly: this route carries no auth
        // middleware, so `$request->user()` would consult the web guard and never
        // see a bearer token — and a member quoted a guest price is a support ticket.
        return $this->successResponse(
            $action->execute($product, $request->user('sanctum')),
            'Price check completed'
        );
    }
}
