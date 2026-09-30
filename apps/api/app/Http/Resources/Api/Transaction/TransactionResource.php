<?php

namespace App\Http\Resources\Api\Transaction;

use App\Enums\GatewayStatus;
use App\Http\Resources\Api\Payment\PaymentResource;
use App\Http\Resources\Api\Product\ProductResource;
use App\Http\Resources\Api\Supplier\SupplierResource;
use App\Http\Resources\User\UserResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class TransactionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'invoice_number' => $this->invoice_number,
            'user_id' => $this->user_id,
            'payment_channel_id' => $this->payment_channel_id,
            'guest_contact' => $this->guest_contact,
            'contact_email' => $this->contact_email,
            'product_id' => $this->product_id,
            'supplier_id' => $this->supplier_id,
            'target_uid' => $this->target_uid,
            'target_server' => $this->target_server,
            'target_nickname' => $this->target_nickname,
            'amount_base' => $this->amount_base,
            'amount_fee' => $this->amount_fee, // combined total (back-compat)
            'channel_fee' => $this->channel_fee,
            'promo_id' => $this->promo_id,
            'discount_amount' => (int) $this->discount_amount,
            'amount_total' => $this->amount_total,
            'total_price' => $this->total_price,
            'margin' => $this->margin,
            // Three status fields that are easy to confuse, so: `status` is the
            // order's combined lifecycle (unchanged, still what every guard reads);
            // `provider_status` is the supplier's half alone, normalized;
            // `payment_status` is the gateway's half, as a word rather than the
            // '1'..'4' storage code; `supplier_status` is uxiolabs's own raw
            // wording, kept as evidence and never authoritative.
            'status' => $this->status,
            'provider_status' => $this->provider_status,
            'payment_status' => GatewayStatus::fromPayment($this->payment?->status)?->value,
            'is_manual' => (bool) $this->is_manual,
            'sn' => $this->sn,
            'supplier_trx_id' => $this->supplier_trx_id,
            'supplier_status' => $this->supplier_status,
            'proof' => $this->proof,
            'proof_url' => $this->proof ? Storage::disk('public')->url($this->proof) : null,
            'user' => new UserResource($this->whenLoaded('user')),
            // One row per supplier order placed for this transaction: exactly
            // one for an ordinary product, one per component for a mix. The
            // columns above describe only the first, so anything showing a mix
            // has to read this to be truthful about the parts.
            'supplier_orders' => $this->whenLoaded('supplierOrders', fn () => $this->supplierOrders
                ->map(fn ($order) => [
                    'id' => (int) $order->id,
                    'product_code' => $order->product?->code,
                    'product_name' => $order->product?->name,
                    'buyer_sku_code' => (string) $order->buyer_sku_code,
                    'idtrx' => (string) $order->idtrx,
                    'supplier_trx_id' => $order->supplier_trx_id,
                    'supplier_status' => $order->supplier_status,
                    'provider_status' => $order->provider_status?->value,
                    'sn' => $order->sn,
                    'last_error' => $order->last_error,
                ])
                ->values()),
            'product' => new ProductResource($this->whenLoaded('product')),
            'supplier' => new SupplierResource($this->whenLoaded('supplier')),
            // PaymentResource → TransactionResource only renders if payment.transaction is loaded;
            // since we don't eager-load that depth, there is no circular rendering in practice.
            'payment' => new PaymentResource($this->whenLoaded('payment')),
            'payment_channel' => $this->whenLoaded('paymentChannel'),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
