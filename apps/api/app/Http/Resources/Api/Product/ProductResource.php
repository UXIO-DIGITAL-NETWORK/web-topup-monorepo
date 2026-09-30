<?php

namespace App\Http\Resources\Api\Product;

use App\Http\Resources\Api\Category\CategoryResource;
use App\Http\Resources\Api\Category\SubCategory\SubCategoryResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class ProductResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // Defence in depth. Every caller should hand this a real product —
        // `Transaction::product()` is declared withTrashed precisely so an
        // archived one still resolves — but this class dereferences `$this->id`
        // straight through DelegatesToResource, so a null resource would fatal
        // the admin transaction list and the dashboard rather than render blank.
        if ($this->resource === null) {
            return [];
        }

        return [
            'id' => $this->id,
            'category_id' => $this->category_id,
            'sub_category_id' => $this->sub_category_id,
            'name' => $this->name,
            'sub_name' => $this->sub_name,
            'code' => $this->code,
            'logo' => $this->logo,
            'logo_url' => $this->logo ? Storage::disk('public')->url($this->logo) : null,
            'description' => $this->description,
            'validasi_nickname' => $this->validasi_nickname,
            'access' => $this->access,
            'tag' => $this->tag,
            'price_modal' => $this->price_modal,
            // Kept for one release: the admin table still sorts and filters on
            // it, and it is the denormalised default-plan price rather than a
            // tier of its own. `prices` below is the real answer.
            'price_member' => $this->price_member,
            // One entry per membership plan the product is priced on. The
            // number of tiers is data now, so the admin UI builds its columns
            // from this rather than from a hardcoded four.
            'prices' => $this->whenLoaded('planPrices', fn () => $this->planPrices
                ->map(fn ($row) => [
                    'membership_plan_id' => (int) $row->membership_plan_id,
                    'plan_code' => $row->membershipPlan?->code,
                    'plan_name' => $row->membershipPlan?->localizedName(),
                    // Which row is the retail price an unsubscribed buyer pays.
                    // Two plans can share a display name, so the table needs
                    // this (and the code) to tell them apart.
                    'is_default' => (bool) $row->membershipPlan?->is_default,
                    'price' => (int) $row->price,
                    'margin_percent' => $row->margin_percent !== null ? (float) $row->margin_percent : null,
                    'margin_flat' => (int) $row->margin_flat,
                    'is_manual' => (bool) $row->is_manual,
                ])
                ->values()),
            'status' => (bool) $this->status,
            // Null is meaningful — it is what makes the admin form show an
            // empty field ("use the global points settings") rather than a 0
            // the customer would read as "earns nothing".
            'point_percent' => $this->point_percent !== null ? (float) $this->point_percent : null,
            'point_flat' => $this->point_flat !== null ? (int) $this->point_flat : null,
            // Where the product sits in its lifecycle, mirroring the pool's
            // `pool_state` / `can_promote` / `promote_blocked_reason` trio.
            // `status` alone cannot answer it: a product is only live when an
            // active supplier mapping backs it, which is the whole reason
            // "Activate" was replaced by Publish.
            //
            // Only emitted when the mappings are already loaded. All three read
            // that relation, and a transaction list embeds this resource per row
            // — computing them unconditionally would turn one page into an N+1.
            $this->mergeWhen($this->resource->relationLoaded('supplierProducts'), fn () => [
                'publish_state' => $this->publishState(),
                'can_publish' => $this->canPublish(),
                'publish_blocked_reason' => $this->publishBlockedReason(),
            ]),
            'published_at' => $this->published_at,
            'archived_at' => $this->deleted_at,
            'is_available' => (bool) $this->is_available,
            'is_price_hidden' => (bool) $this->is_price_hidden,
            'price_min' => $this->price_min,
            'price_max' => $this->price_max,
            // The product's own standing discount. Emitted always rather than
            // behind `whenLoaded`: they are columns on this row, so there is no
            // query to save, and the form needs them to show an existing cut.
            'discount_type' => $this->discount_type,
            'discount_value' => $this->discount_value !== null ? (int) $this->discount_value : null,
            // The mix, only when it was loaded — same N+1 reasoning as the
            // publish trio above (a transaction list embeds this per row).
            $this->mergeWhen($this->resource->relationLoaded('mixItems'), fn () => [
                'is_mix' => $this->mixItems->isNotEmpty(),
                // `cost` per line so the admin can see where the accumulated
                // `price_modal` came from, instead of a single number to trust.
                'mix_items' => $this->mixItems->map(fn ($item) => [
                    'product_id' => (int) $item->component_product_id,
                    'name' => $item->component?->name,
                    'code' => $item->component?->code,
                    'cost' => (int) ($item->component?->price_modal ?? 0),
                    'quantity' => (int) $item->quantity,
                ])->values(),
            ]),
            'category' => new CategoryResource($this->whenLoaded('category')),
            'sub_category' => new SubCategoryResource($this->whenLoaded('subCategory')),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
