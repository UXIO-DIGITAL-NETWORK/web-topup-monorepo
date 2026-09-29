<?php

namespace App\Http\Controllers\Api\Merchant;

use App\Http\Controllers\Controller;
use App\Queries\UnifiedTransactionQuery;
use App\Support\Csv;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The client's money movements, both directions in one feed: sales attributed
 * to them via `transactions.merchant_id` (money in) and the service bills kita
 * issued them (money out). `type=all|sale|service` picks the tab.
 *
 * The projection is deliberately narrow — the client sees its own net sale
 * price, never the platform's markup, the gateway fee, or supplier ids. The
 * query is built with `withPlatformFigures: false`, so those columns are not
 * even selected.
 */
class MerchantTransactionController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $perPage = min(100, max(1, (int) $request->query('per_page', 20)));

        $rows = $this->query($request)
            ->build(
                (string) $request->query('type', UnifiedTransactionQuery::TYPE_ALL),
                $request->query('status'),
                $request->query('search'),
                $request->query('status_group'),
            )
            ->paginate($perPage)
            ->through(fn ($row) => [
                'type' => $row->source,
                // Ids are unique only WITHIN a type — the client must key rows
                // on the pair, not on the id alone.
                'id' => (int) $row->source_id,
                'invoice_number' => $row->invoice_number,
                'title' => $row->title,
                'direction' => $row->direction,
                'amount' => (int) $row->amount,
                'status' => $row->status,
                // The two halves apart: did the customer pay, and did the
                // supplier deliver. `provider_status` is null on a service bill,
                // which has no supplier behind it.
                'provider_status' => $row->provider_status,
                'payment_status' => $row->payment_status,
                'payment_channel' => $row->channel,
                'created_at' => $this->iso($row->occurred_at),
            ]);

        return $this->successResponse($rows, 'Transactions retrieved successfully');
    }

    /** Status-bucket counts + total for the summary pills and Recap dialog. */
    public function summary(Request $request)
    {
        $summary = $this->query($request)->summary(
            (string) $request->query('type', UnifiedTransactionQuery::TYPE_ALL),
            $request->query('search'),
        );

        return $this->successResponse($summary, 'Transaction summary retrieved successfully');
    }

    /**
     * CSV of the filtered set (no pagination). Binary/stream response — an
     * intentional deviation from the ApiResponse envelope, like the uxiolabs
     * import template. Same narrow projection: no platform figures.
     */
    public function export(Request $request): StreamedResponse
    {
        $rows = $this->query($request)
            ->build(
                (string) $request->query('type', UnifiedTransactionQuery::TYPE_ALL),
                $request->query('status'),
                $request->query('search'),
                $request->query('status_group'),
            )
            ->get();

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Invoice', 'Item', 'Metode', 'Arah', 'Jumlah', 'Status', 'Tanggal']);
            foreach ($rows as $row) {
                // The projection is already narrow; Csv::row is the second half
                // — a product title must not become a formula in the export.
                fputcsv($out, Csv::row([
                    $row->invoice_number,
                    $row->title,
                    $row->channel ?? '',
                    $row->direction === 'out' ? 'Keluar' : 'Masuk',
                    (int) $row->amount,
                    $row->status,
                    $this->iso($row->occurred_at),
                ]));
            }
            fclose($out);
        }, 'transaksi.csv', ['Content-Type' => 'text/csv']);
    }

    /** The caller's own feed, with the date range applied; never platform figures. */
    private function query(Request $request): UnifiedTransactionQuery
    {
        return new UnifiedTransactionQuery(
            merchantId: $request->user()->id,
            startDate: $request->query('start_date'),
            endDate: $request->query('end_date'),
        );
    }

    /** Raw rows come back with driver-formatted date strings, not Carbon. */
    private function iso(?string $value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }
}
