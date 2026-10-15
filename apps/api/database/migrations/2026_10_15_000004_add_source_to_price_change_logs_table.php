<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which path noticed the change.
     *
     * The log already recorded *what* moved; it could not say whether the
     * 5-minute sweep found it or a buyer's checkout did. Those are different
     * signals: a sweep finding it is routine, a checkout finding it means the
     * price moved twice inside one sync window.
     *
     * Default `sweep` is the honest answer for every row written before this
     * column existed — the sweep was the only writer — so nothing is backfilled.
     */
    public function up(): void
    {
        Schema::table('price_change_logs', function (Blueprint $table) {
            $table->string('source', 20)->default('sweep')->after('status');
            $table->index(['source', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::table('price_change_logs', function (Blueprint $table) {
            $table->dropIndex(['source', 'created_at']);
            $table->dropColumn('source');
        });
    }
};
