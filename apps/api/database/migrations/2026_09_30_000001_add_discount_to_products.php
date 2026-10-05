<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A per-product discount, typed by the admin on the product form.
 *
 * This is NOT the flash sale (time-boxed, stock-limited, its own screen) and
 * NOT a promo code (customer types it at checkout). It is a standing price cut
 * that belongs to the product itself, so the storefront can show a strikethrough
 * price without the admin having to schedule anything.
 *
 * Both columns are nullable, and that is load-bearing: null means "no discount"
 * — which is not the same as `discount_value = 0`, the explicit "discount is
 * configured but worth nothing" the form can transiently hold.
 *
 * `discount_type` is `percent` (value is a percentage of the plan price) or
 * `fixed` (value is rupiah off). Like every other price in this codebase the
 * discount only ever LOWERS the price — see `App\Support\Pricing\ProductDiscount`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->enum('discount_type', ['percent', 'fixed'])->nullable()->after('price_max');
            $table->unsignedInteger('discount_value')->nullable()->after('discount_type');
        });
    }

    public function down(): void
    {
        Schema::table('products', fn (Blueprint $table) => $table->dropColumn(['discount_type', 'discount_value']));
    }
};
