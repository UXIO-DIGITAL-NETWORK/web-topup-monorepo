<?php

namespace App\Actions\Transaction;

use App\Enums\GatewayStatus;
use App\Enums\PaymentStatus;
use App\Models\Transaction;
use App\Support\Phone;
use Illuminate\Pagination\LengthAwarePaginator;

class GetTransactionsAction
{
    /** Whitelisted to real, indexed-friendly columns — never interpolate a raw sort_by from the request. */
    private const SORTABLE_COLUMNS = ['invoice_number', 'amount_total', 'status', 'created_at'];

    /** Not a GatewayStatus: "this order never went through a gateway at all". */
    public const PAYMENT_STATUS_NONE = 'NONE';

    /**
     * The '1'..'4' code behind a gateway word, or null if the word is unknown.
     * Shared with ExportTransactionsAction so a filtered export matches the list
     * it was exported from.
     */
    public static function paymentCodeFor(string $word): ?string
    {
        return match (GatewayStatus::tryFrom($word)) {
            GatewayStatus::PENDING => PaymentStatus::PENDING->value,
            GatewayStatus::EXPIRED => PaymentStatus::EXPIRED->value,
            GatewayStatus::SUCCESS => PaymentStatus::SUCCESS->value,
            GatewayStatus::REFUNDED => PaymentStatus::REFUNDED->value,
            // CANCELLED only exists on the service-invoice leg, which this
            // admin list does not cover.
            default => null,
        };
    }

    public function execute(
        int $perPage,
        ?string $status,
        ?string $search,
        ?int $userId = null,
        ?int $productId = null,
        ?int $paymentChannelId = null,
        ?string $startDate = null,
        ?string $endDate = null,
        ?string $sortBy = null,
        string $sortDir = 'desc',
        ?string $providerStatus = null,
        ?string $paymentStatus = null,
    ): LengthAwarePaginator {
        $sortColumn = in_array($sortBy, self::SORTABLE_COLUMNS, true) ? $sortBy : 'created_at';
        $sortDirection = strtolower($sortDir) === 'asc' ? 'asc' : 'desc';

        return Transaction::query()
            ->with(['user', 'product.category', 'supplier', 'payment', 'paymentChannel', 'supplierOrders.product'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->when($providerStatus, fn ($q) => $q->where('provider_status', $providerStatus))
            // 'NONE' is not a gateway state — it selects orders with no payment row
            // at all (admin-created / manually recorded), which is the whole point
            // of the Manual tab and is otherwise unreachable.
            ->when($paymentStatus === self::PAYMENT_STATUS_NONE, fn ($q) => $q->doesntHave('payment'))
            ->when($paymentStatus && $paymentStatus !== self::PAYMENT_STATUS_NONE, function ($q) use ($paymentStatus) {
                $code = self::paymentCodeFor($paymentStatus);

                // An unknown word must return nothing, not silently everything.
                $q->whereHas('payment', fn ($p) => $p->where('status', $code ?? '__none__'));
            })
            // The admin table's search box sits above both the invoice and the
            // customer column, so matching only the invoice number made a
            // name search look like "no results" rather than "not supported".
            // Guests have no user row — their contact is on the transaction.
            // Phone spellings are expanded because the columns hold more than
            // one: contact numbers are only canonical from the E.164 release
            // onward and the older rows were never migrated, so an admin typing
            // "0812…" must still find a row stored as "+62812…".
            ->when($search, fn ($q) => $q->where(
                function ($q) use ($search) {
                    $q->where('invoice_number', 'like', "%{$search}%")
                        ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%")
                            ->orWhere('email', 'like', "%{$search}%"));

                    foreach (array_unique([$search, ...Phone::candidates($search)]) as $spelling) {
                        $q->orWhere('guest_contact', 'like', "%{$spelling}%")
                            ->orWhereHas('user', fn ($u) => $u->where('phone', 'like', "%{$spelling}%"));
                    }
                }
            ))
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->when($productId, fn ($q) => $q->where('product_id', $productId))
            ->when($paymentChannelId, fn ($q) => $q->where('payment_channel_id', $paymentChannelId))
            ->when($startDate, fn ($q) => $q->where('created_at', '>=', $startDate))
            ->when($endDate, fn ($q) => $q->where('created_at', '<=', $endDate))
            ->orderBy($sortColumn, $sortDirection)
            ->paginate($perPage);
    }
}
