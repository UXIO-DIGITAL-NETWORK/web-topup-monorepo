<?php

namespace App\Http\Controllers\Api\Finance;

use App\Http\Controllers\Controller;
use App\Queries\UnifiedTransactionQuery;
use App\Support\Csv;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Every client's money movements, full financial breakdown — kita sees the
 * split the merchant projection deliberately hides (admin fee, gateway fee,
 * own profit). `type=all|sale|service` picks the tab; `merchant_id` narrows to
 * one client.
 *
 * `direction` stays client-relative here too ("in" = money into the client),
 * matching what the "Nett Merchant" column has always meant on this screen.
 */
class FinanceTransactionController extends Controller
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
                'id' => (int) $row->source_id,
                'invoice_number' => $row->invoice_number,
                'title' => $row->title,
                'merchant' => $row->merchant_id
                    ? ['id' => (int) $row->merchant_id, 'name' => $row->merchant_name]
                    : null,
                'direction' => $row->direction,
                'amount' => (int) $row->amount,
                'amount_total' => (int) $row->amount_total,
                // "Biaya Admin" = the payment method's fee. Genuinely 0 on a
                // service bill, which has no channel behind it.
                'admin_fee' => (int) $row->admin_fee,
                'gateway_fee' => (int) $row->gateway_fee,
                'platform_profit' => (int) $row->platform_profit,
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

    /** Status-bucket counts + fee/profit totals for the summary pills and Recap. */
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
     * intentional deviation from the ApiResponse envelope. Full breakdown, as
     * kita is allowed to see it.
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
            fputcsv($out, ['Invoice', 'Client', 'Item', 'Total', 'Biaya Admin', 'Fee Gateway', 'Profit Kita', 'Status', 'Tanggal']);
            foreach ($rows as $row) {
                // Merchant name and item title are client-controlled; Csv::row
                // keeps them text in the operator's spreadsheet.
                fputcsv($out, Csv::row([
                    $row->invoice_number,
                    $row->merchant_name ?? '',
                    $row->title,
                    (int) $row->amount_total,
                    (int) $row->admin_fee,
                    (int) $row->gateway_fee,
                    (int) $row->platform_profit,
                    $row->status,
                    $this->iso($row->occurred_at),
                ]));
            }
            fclose($out);
        }, 'transaksi.csv', ['Content-Type' => 'text/csv']);
    }

    /** Cross-merchant (or one merchant) feed with fee/profit columns + date range. */
    private function query(Request $request): UnifiedTransactionQuery
    {
        $merchantId = $request->query('merchant_id');

        return new UnifiedTransactionQuery(
            merchantId: $merchantId !== null ? (int) $merchantId : null,
            withPlatformFigures: true,
            startDate: $request->query('start_date'),
            endDate: $request->query('end_date'),
        );
    }

    private function iso(?string $value): ?string
    {
        return $value ? Carbon::parse($value)->toIso8601String() : null;
    }
}
