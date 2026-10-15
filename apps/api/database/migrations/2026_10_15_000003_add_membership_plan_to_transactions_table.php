<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which membership tier priced this order.
     *
     * Price comes from `product_plan_prices`, keyed on the customer's plan, and
     * the resolved tier was thrown away the moment checkout finished — so the
     * admin could see the figure it produced but not which price list it came
     * from, and re-deriving it later would answer a different question (the
     * customer's plan *today*).
     *
     * Nullable and deliberately un-backfilled: for an older order the plan that
     * priced it cannot be recovered honestly, so absence is the truth there.
     * Null also covers the legacy `price_member` fallback, which only happens
     * when no plan price exists at all.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('membership_plan_id')->nullable()->after('cost_price')
                ->constrained('membership_plans')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('membership_plan_id');
        });
    }
};
