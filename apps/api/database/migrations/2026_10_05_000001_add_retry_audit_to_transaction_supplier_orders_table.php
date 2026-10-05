<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Who last re-hit a sub-order with the supplier, and when.
 *
 * A mix is delivered by several sub-orders and any one of them can stall, so
 * the transaction detail screen lists them individually and an operator can
 * re-ask the supplier about one part. The columns are nullable: the scheduled
 * poller also touches a row, and "rehit by the system" is not the same as
 * "rehit by an admin", so the absence of a user is meaningful.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transaction_supplier_orders', function (Blueprint $table) {
            $table->foreignId('retried_by_user_id')->nullable()->after('last_error')
                ->constrained('users')->nullOnDelete();
            $table->timestamp('retried_at')->nullable()->after('retried_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('transaction_supplier_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('retried_by_user_id');
            $table->dropColumn('retried_at');
        });
    }
};
