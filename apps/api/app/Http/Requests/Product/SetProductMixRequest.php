<?php

namespace App\Http\Requests\Product;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The mix builder's submit: the whole composition, not a patch.
 *
 * Replace-in-place is deliberate — a mix is a set, and reconciling a diff would
 * mean guessing whether a missing row was removed or merely not sent.
 *
 * The cap matches the UI's own row limit: a mix of more than a handful of
 * components is far more likely to be a mistake than an intention, and every
 * component costs a supplier order at fulfilment.
 */
class SetProductMixRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            /** `present`, not `required`: an empty array is how the admin clears a mix. */
            'items' => ['present', 'array', 'max:20'],
            'items.*.product_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:100'],
        ];
    }

    /**
     * @return array<int,array{product_id:int,quantity:int}>
     */
    public function items(): array
    {
        return array_map(
            fn (array $item) => [
                'product_id' => (int) $item['product_id'],
                'quantity' => (int) $item['quantity'],
            ],
            $this->validated('items'),
        );
    }
}
