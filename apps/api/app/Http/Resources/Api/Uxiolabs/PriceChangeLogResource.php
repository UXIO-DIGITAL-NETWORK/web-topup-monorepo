<?php

namespace App\Http\Resources\Api\Uxiolabs;

use App\Enums\PriceChangeLogStatus;
use App\Models\PriceChangeLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin PriceChangeLog
 */
class PriceChangeLogResource extends JsonResource
{
    /**
     * @return array<string,mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'supplier_product_id' => $this->supplier_product_id,
            'product_id' => $this->product_id,
            'buyer_sku_code' => $this->buyer_sku_code,
            'product_name' => $this->product_name,
            'status' => $this->status->value,
            'source' => $this->source->value,
            'needs_attention' => in_array($this->status->value, PriceChangeLogStatus::needsAttention(), true),
            'reason' => $this->reason,
            'old_cost' => $this->old_cost,
            'new_cost' => $this->new_cost,
            'prices' => [
                'member' => ['old' => $this->old_price_member, 'new' => $this->new_price_member],
                'vip' => ['old' => $this->old_price_vip, 'new' => $this->new_price_vip],
                'reseller' => ['old' => $this->old_price_reseller, 'new' => $this->new_price_reseller],
                'agent' => ['old' => $this->old_price_agent, 'new' => $this->new_price_agent],
            ],
            'created_at' => $this->created_at,
        ];
    }
}
