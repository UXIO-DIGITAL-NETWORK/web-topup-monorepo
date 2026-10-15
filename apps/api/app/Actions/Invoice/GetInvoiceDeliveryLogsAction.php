<?php

declare(strict_types=1);

namespace App\Actions\Invoice;

use App\Models\InvoiceDeliveryLog;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * The admin log read: newest attempts first, narrowed by the four things an
 * operator actually hunts with — which order, which channel, which outcome, and
 * a free-text invoice number.
 */
class GetInvoiceDeliveryLogsAction
{
    /**
     * @param  array<string,mixed>  $filters
     */
    public function execute(int $perPage, array $filters = []): LengthAwarePaginator
    {
        return InvoiceDeliveryLog::query()
            ->with('transaction:id,invoice_number')
            ->when($filters['transaction_id'] ?? null, fn ($q, $id) => $q->where('transaction_id', (int) $id))
            ->when($filters['channel'] ?? null, fn ($q, $channel) => $q->where('channel', (string) $channel))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', (string) $status))
            ->when(
                $filters['search'] ?? null,
                fn ($q, $search) => $q->whereHas(
                    'transaction',
                    fn ($t) => $t->where('invoice_number', 'like', '%'.$search.'%')
                )
            )
            ->when($filters['start_date'] ?? null, fn ($q, $date) => $q->whereDate('attempted_at', '>=', $date))
            ->when($filters['end_date'] ?? null, fn ($q, $date) => $q->whereDate('attempted_at', '<=', $date))
            // `id` breaks ties: two channels log within the same second.
            ->orderByDesc('attempted_at')
            ->orderByDesc('id')
            ->paginate($perPage);
    }
}
