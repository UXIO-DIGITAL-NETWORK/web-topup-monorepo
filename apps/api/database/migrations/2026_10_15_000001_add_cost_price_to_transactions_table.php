<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Freeze the supplier's cost on the order.
     *
     * `margin` alone could not answer "what did this sale cost us": the cost was
     * resolved live at checkout (the mapping's price, or the sum of a mix's
     * components) and then discarded, leaving only `margin = selling − cost`.
     * That cannot be inverted reliably, because a points redemption lowers
     * `amount_base` while the margin is deliberately left alone — so
     * `amount_base − margin` reads as a smaller cost than was actually paid.
     *
     * Nullable and un-backfilled, like the product snapshot: rows written before
     * this column show an absence rather than a guessed figure.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->bigInteger('cost_price')->nullable()->after('margin')
                ->comment('Harga modal supplier saat checkout (snapshot)');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn('cost_price');
        });
    }
};
