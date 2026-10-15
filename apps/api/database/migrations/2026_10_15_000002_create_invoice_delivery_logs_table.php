<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every attempt to hand the invoice to the buyer, and how it ended.
     *
     * The order's own columns only say *whether* a receipt was handed over
     * (`receipt_sent_at`, `whatsapp_sent_at`), and they are stamped when the
     * send is queued — so a queued send that later failed looked identical to
     * one that arrived. This table is the trail: one row per attempt, per
     * channel, with the outcome and the gateway's own words when it failed.
     */
    public function up(): void
    {
        Schema::create('invoice_delivery_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained()->cascadeOnDelete();
            $table->string('channel', 16)->comment('email | whatsapp');
            $table->string('recipient')->nullable()->comment('Alamat email atau nomor WA yang dituju');
            $table->string('status', 16)->comment('sent | failed | skipped');
            $table->string('reason')->nullable()->comment('Pesan kegagalan, atau alasan dilewati');
            $table->boolean('is_resend')->default(false)->comment('Dikirim ulang manual oleh admin');
            $table->timestamp('attempted_at');
            $table->timestamps();

            // The two reads that exist: one order's trail, and the ops sweep for
            // failures across every order.
            $table->index(['transaction_id', 'id']);
            $table->index(['status', 'attempted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_delivery_logs');
    }
};
