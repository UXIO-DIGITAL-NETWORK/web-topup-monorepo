<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per supplier order placed for a transaction.
 *
 * Until now a transaction was exactly one supplier order: `transactions.
 * supplier_trx_id` held it, and the callback matched on `invoice_number`. A mix
 * product breaks that assumption — one paid order, several top-ups — and the
 * supplier rejects two orders sharing an `idtrx`, so each one needs its own.
 *
 * `idtrx` is therefore per row and DISTINCT (the transaction's invoice number
 * plus a sequence), and this table is what the callback resolves against.
 * `transactions.supplier_trx_id`/`sn` stay as a summary of the FIRST order so
 * the existing screens and reports keep working.
 *
 * `sequence` exists because a mix can ask for MORE THAN ONE of a component: a
 * component with quantity 3 needs three supplier orders, and each one has to be
 * addressable on its own — so the key is (transaction, component, sequence), not
 * (transaction, component).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transaction_supplier_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained('transactions')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->restrictOnDelete();
            $table->unsignedSmallInteger('sequence')->default(1);
            $table->foreignId('supplier_product_id')->nullable()->constrained('supplier_products')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();

            /** Snapshot: the mapping may be repointed after the order was placed. */
            $table->string('buyer_sku_code');

            /** Our own reference for THIS sub-order — what the supplier echoes back. */
            $table->string('idtrx')->unique();

            $table->string('supplier_trx_id')->nullable();
            $table->string('supplier_status')->nullable();
            $table->string('provider_status', 32)->default('NOT_ORDERED');
            $table->string('sn')->nullable();
            $table->unsignedInteger('attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->unique(['transaction_id', 'product_id', 'sequence'], 'transaction_supplier_orders_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_supplier_orders');
    }
};
