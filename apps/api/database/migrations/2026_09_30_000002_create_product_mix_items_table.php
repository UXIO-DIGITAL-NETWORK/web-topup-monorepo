<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A product's composition: which other products it sells together, and how many
 * of each.
 *
 * "Mix" is what the admin calls it — 5 Diamonds + 10 Diamonds sold as ONE
 * product. The product row stays the thing that is sold and priced; these rows
 * say what has to be fulfilled for it.
 *
 * `component_product_id` is RESTRICT rather than cascade: deleting a component
 * would silently change what a mix sells, and the products table is soft-deleted
 * anyway. Nesting (a mix inside a mix) is refused in the action, not here — a
 * database constraint cannot express it without a trigger.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_mix_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('component_product_id')->constrained('products')->restrictOnDelete();
            $table->unsignedInteger('quantity')->default(1);
            $table->timestamps();

            // One row per component: the same product twice is a quantity, not a
            // second line, and this is what makes the accumulated cost add up
            // exactly once.
            $table->unique(['product_id', 'component_product_id'], 'product_mix_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_mix_items');
    }
};
