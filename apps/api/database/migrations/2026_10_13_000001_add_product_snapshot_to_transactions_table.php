<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Freeze the product's identity on the order.
     *
     * Product name and code were read live from `products` at display time, so
     * renaming (or repurposing) a product silently rewrote what every past order
     * appeared to have sold. The row is kept, not the fact. These two columns
     * capture the fact at checkout, the same way the money columns already do —
     * `price_change_logs.product_name` is the precedent.
     *
     * Nullable and un-backfilled: older rows fall back to the relation, which
     * still resolves through `withTrashed`.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->string('product_name')->nullable()->after('product_id');
            $table->string('product_code')->nullable()->after('product_name');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn(['product_name', 'product_code']);
        });
    }
};
