<?php

namespace App\Http\Requests\Product;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The provider picker's submit: raw provider SKUs, no product fields.
 *
 * Same shape and cap as `PoolUxiolabsSkusRequest` — the price-list index is per
 * request, and the caller may select a whole category at once.
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
            'buyer_sku_codes' => ['required', 'array', 'min:1', 'max:200'],
            'buyer_sku_codes.*' => ['required', 'string', 'max:255'],
        ];
    }

    /**
     * @return array<int,string>
     */
    public function skuCodes(): array
    {
        return array_map('strval', $this->validated('buyer_sku_codes'));
    }
}
