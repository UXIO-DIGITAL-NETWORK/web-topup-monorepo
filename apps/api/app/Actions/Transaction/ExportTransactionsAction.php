<?php

namespace App\Actions\Transaction;

use App\Models\Transaction;
use App\Support\Phone;
use Illuminate\Support\Collection;

/**
 * The unpaginated twin of GetTransactionsAction: the same filters, every
 * matching row, for a CSV export. Kept separate so the list endpoint keeps its
 * paginator and the export never accidentally pages.
 */
class ExportTransactionsAction
{
    public function execute(
        ?string $status = null,
        ?string $search = null,
        ?int $userId = null,
        ?int $productId = null,
        ?int $paymentChannelId = null,
        ?string $startDate = null,
        ?string $endDate = null,
        ?string $providerStatus = null,
        ?string $paymentStatus = null,
        ?int $categoryId = null,
        ?string $customerType = null,
    ): Collection {
        return Transaction::query()
            ->with(['user', 'product', 'paymentChannel', 'payment'])
            ->when($status, fn ($q) => $q->where('status', $status))
            ->when($providerStatus, fn ($q) => $q->where('provider_status', $providerStatus))
            ->when($paymentStatus === GetTransactionsAction::PAYMENT_STATUS_NONE, fn ($q) => $q->doesntHave('payment'))
            ->when($paymentStatus && $paymentStatus !== GetTransactionsAction::PAYMENT_STATUS_NONE, function ($q) use ($paymentStatus) {
                $code = GetTransactionsAction::paymentCodeFor($paymentStatus);
                $q->whereHas('payment', fn ($p) => $p->where('status', $code ?? '__none__'));
            })
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
            // The export must mean the same thing as the list it was exported
            // from, so these two travel exactly as they do in
            // GetTransactionsAction — down to "an unknown customer_type matches
            // nothing".
            ->when($categoryId, fn ($q) => $q->whereHas('product', fn ($p) => $p->where('category_id', $categoryId)))
            ->when($customerType !== null, function ($q) use ($customerType) {
                match ($customerType) {
                    GetTransactionsAction::CUSTOMER_GUEST => $q->whereNull('user_id'),
                    GetTransactionsAction::CUSTOMER_MEMBER => $q->whereNotNull('user_id'),
                    default => $q->whereRaw('1 = 0'),
                };
            })
            ->when($startDate, fn ($q) => $q->where('created_at', '>=', $startDate))
            ->when($endDate, fn ($q) => $q->where('created_at', '<=', $endDate))
            ->orderBy('created_at', 'desc')
            ->get();
    }
}
