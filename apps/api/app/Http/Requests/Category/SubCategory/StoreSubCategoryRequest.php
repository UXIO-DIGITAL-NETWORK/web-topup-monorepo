<?php

namespace App\Http\Requests\Category\SubCategory;

use App\DTOs\Category\SubCategory\CreateSubCategoryDTO;
use Illuminate\Foundation\Http\FormRequest;

class StoreSubCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:255'],
            'currency_name' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            // Optional: a sub category is a grouping label, not a storefront
            // card, so nothing stops one being created before its artwork
            // exists. When a file IS sent it is still validated as an image.
            'logo' => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:2048'],
            'status' => ['required', 'boolean'],
        ];
    }

    public function toDTO(): CreateSubCategoryDTO
    {
        return new CreateSubCategoryDTO(
            categoryId: $this->validated('category_id'),
            name: $this->validated('name'),
            currencyName: $this->validated('currency_name'),
            description: $this->validated('description'),
            // Gunakan $this->file() khusus untuk mengambil file fisik
            logo: $this->file('logo'),
            status: $this->validated('status')
        );
    }
}
