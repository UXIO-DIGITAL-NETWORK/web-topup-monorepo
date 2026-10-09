<?php

namespace App\Http\Requests\Product;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The add-products modal's submit: one entry per product, with everything the
 * admin filled in, so a product is created AND configured in one call.
 *
 * Two shapes on purpose. `items` is the modal's — rich, one object per product.
 * `buyer_sku_codes` is the older, codes-only list (a plain "pull these in as
 * drafts"), kept because it is what the previous screen sent and the two must
 * not disagree about what a batch means.
 */
class AddProductsFromSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // Codes-only shape.
            'buyer_sku_codes' => ['required_without:items', 'array', 'min:1', 'max:200'],
            'buyer_sku_codes.*' => ['required', 'string', 'max:255'],

            // Rich shape. Capped lower than the codes list: every entry here can
            // write prices and a mix, so fifty is already a lot of work in one
            // request.
            'items' => ['required_without:buyer_sku_codes', 'array', 'min:1', 'max:50'],
            'items.*.buyer_sku_code' => ['required', 'string', 'max:255'],
            'items.*.name' => ['nullable', 'string', 'max:255'],
            'items.*.sub_name' => ['nullable', 'string', 'max:255'],
            'items.*.code' => ['nullable', 'string', 'max:255'],
            'items.*.sub_category_id' => ['nullable', 'integer', 'exists:sub_categories,id'],
            'items.*.discount_type' => ['nullable', 'in:percent,fixed'],
            'items.*.discount_value' => ['nullable', 'integer', 'min:0'],
            // Nullable on purpose: absent/blank means "use the global points
            // settings", which is not the same as an explicit 0.
            'items.*.point_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.point_flat' => ['nullable', 'integer', 'min:0'],
            'items.*.price_min' => ['nullable', 'integer', 'min:0'],
            'items.*.price_max' => ['nullable', 'integer', 'min:0'],
            'items.*.margins' => ['nullable', 'array'],
            'items.*.margins.*' => ['nullable', 'numeric', 'min:-100', 'max:1000'],
            'items.*.mix_items' => ['nullable', 'array', 'max:20'],
            'items.*.mix_items.*.product_id' => ['required', 'integer'],
            'items.*.mix_items.*.quantity' => ['required', 'integer', 'min:1', 'max:100'],
            // Optional per-product logo, sent as multipart with the rest of the row.
            'items.*.logo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp,avif', 'max:10240'],
            'items.*.publish' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Normalised to one shape, so the action never branches on which form the
     * caller used.
     *
     * @return array<int,array<string,mixed>>
     */
    public function items(): array
    {
        if ($this->filled('items')) {
            $items = [];

            // Indexed so each row's uploaded logo can be pulled back out of the
            // multipart payload — `validated()` carries scalar fields only.
            foreach ($this->validated('items') as $index => $item) {
                $margins = [];

                foreach (($item['margins'] ?? []) as $planId => $percent) {
                    // Plan ids arrive as object keys, so they are strings here.
                    // A multipart form cannot carry null, so "" is the same
                    // "no override" the JSON shape sent as null.
                    $margins[(int) $planId] = ($percent === null || $percent === '') ? null : (float) $percent;
                }

                $items[] = [
                    'buyer_sku_code' => (string) $item['buyer_sku_code'],
                    'name' => $item['name'] ?? null,
                    'sub_name' => $item['sub_name'] ?? null,
                    'code' => $item['code'] ?? null,
                    'sub_category_id' => isset($item['sub_category_id']) ? (int) $item['sub_category_id'] : null,
                    'discount_type' => $item['discount_type'] ?? null,
                    'discount_value' => isset($item['discount_value']) ? (int) $item['discount_value'] : null,
                    'point_percent' => isset($item['point_percent']) ? (float) $item['point_percent'] : null,
                    'point_flat' => isset($item['point_flat']) ? (int) $item['point_flat'] : null,
                    'price_min' => isset($item['price_min']) ? (int) $item['price_min'] : null,
                    'price_max' => isset($item['price_max']) ? (int) $item['price_max'] : null,
                    'margins' => $margins,
                    'mix_items' => array_map(fn (array $line) => [
                        'product_id' => (int) $line['product_id'],
                        'quantity' => (int) $line['quantity'],
                    ], $item['mix_items'] ?? []),
                    'logo' => $this->file("items.{$index}.logo"),
                    'publish' => (bool) ($item['publish'] ?? false),
                ];
            }

            return $items;
        }

        // The plain list: codes only, nothing configured, left as drafts.
        return array_map(fn ($code) => [
            'buyer_sku_code' => (string) $code,
            'name' => null,
            'sub_name' => null,
            'code' => null,
            'sub_category_id' => null,
            'discount_type' => null,
            'discount_value' => null,
            'point_percent' => null,
            'point_flat' => null,
            'price_min' => null,
            'price_max' => null,
            'margins' => [],
            'mix_items' => [],
            'logo' => null,
            'publish' => false,
        ], $this->validated('buyer_sku_codes'));
    }
}
