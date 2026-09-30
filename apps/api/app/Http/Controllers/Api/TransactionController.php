<?php

namespace App\Http\Controllers\Api;

use App\Actions\Transaction\AdminRefundTransactionAction;
use App\Actions\Transaction\AdminResendCallbackAction;
use App\Actions\Transaction\AdminResendReceiptAction;
use App\Actions\Transaction\AdminRetryTransactionAction;
use App\Actions\Transaction\CreateTransactionAction;
use App\Actions\Transaction\DeleteTransactionAction;
use App\Actions\Transaction\ExportTransactionsAction;
use App\Actions\Transaction\GetTransactionRecapAction;
use App\Actions\Transaction\GetTransactionsAction;
use App\Actions\Transaction\GetTransactionStatusCountsAction;
use App\Actions\Transaction\ManualReviewTransactionAction;
use App\Actions\Transaction\UpdateTransactionAction;
use App\Enums\GatewayStatus;
use App\Enums\RefundMethod;
use App\Http\Controllers\Controller;
use App\Http\Requests\Transaction\ManualReviewTransactionRequest;
use App\Http\Requests\Transaction\RefundTransactionRequest;
use App\Http\Requests\Transaction\StoreTransactionRequest;
use App\Http\Requests\Transaction\UpdateTransactionRequest;
use App\Http\Resources\Api\Refund\RefundRequestResource;
use App\Http\Resources\Api\Transaction\TransactionResource;
use App\Models\Transaction;
use App\Support\Csv;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TransactionController extends Controller
{
    use ApiResponse;

    /**
     * Every single-transaction response loads the same relations, so the list
     * lives here rather than being repeated at each return. `product.category`
     * implies `product`; it is what the admin renders as the order's "Game",
     * and ProductResource only emits `category` when it is loaded.
     */
    private const RELATIONS = ['user', 'product.category', 'supplier', 'payment', 'paymentChannel', 'supplierOrders.product'];

    public function statusCounts(GetTransactionStatusCountsAction $action)
    {
        return $this->successResponse($action->execute(), 'Transaction status counts retrieved successfully');
    }

    public function index(Request $request, GetTransactionsAction $action)
    {
        $perPage = min(100, max(1, (int) $request->query('per_page', 15)));
        $status = $request->query('status');       // e.g. ?status=PENDING
        $search = $request->query('search');       // e.g. ?search=INV-20260605
        $userId = $request->query('user_id');
        $productId = $request->query('product_id');
        $paymentChannelId = $request->query('payment_channel_id');

        $transactions = $action->execute(
            $perPage,
            $status,
            $search,
            $userId !== null ? (int) $userId : null,
            $productId !== null ? (int) $productId : null,
            $paymentChannelId !== null ? (int) $paymentChannelId : null,
            $request->query('start_date'),
            $request->query('end_date'),
            $request->query('sort_by'),
            (string) $request->query('sort_dir', 'desc'),
            // The supplier's half and the gateway's half, filterable apart —
            // `status` alone could never express "paid but the supplier failed".
            $request->query('provider_status'),
            $request->query('payment_status'),
        );

        return $this->paginatedResponse(TransactionResource::collection($transactions), 'Transactions retrieved successfully');
    }

    public function store(StoreTransactionRequest $request, CreateTransactionAction $action)
    {
        $transaction = $action->execute($request->toDTO());

        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Transaction created successfully',
            201
        );
    }

    public function show(Transaction $transaction)
    {
        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Transaction retrieved successfully'
        );
    }

    public function update(UpdateTransactionRequest $request, Transaction $transaction, UpdateTransactionAction $action)
    {
        $transaction = $action->execute($transaction, $request->toDTO());

        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Transaction updated successfully'
        );
    }

    public function destroy(Transaction $transaction, DeleteTransactionAction $action)
    {
        $action->execute($transaction);

        return $this->successResponse(null, 'Transaction deleted successfully');
    }

    public function manualReview(ManualReviewTransactionRequest $request, Transaction $transaction, ManualReviewTransactionAction $action)
    {
        $transaction = $action->execute($transaction, $request->toDTO());

        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Transaction reviewed successfully'
        );
    }

    public function refund(RefundTransactionRequest $request, Transaction $transaction, AdminRefundTransactionAction $action)
    {
        try {
            $refund = $action->execute($transaction, $request->validated('reason'));
        } catch (RuntimeException $e) {
            // Not paid, already refunded, or a refund already queued — an admin
            // must be told, not handed a success for something that didn't run.
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            [
                // fresh(), not load(): the refund action wrote transactions.status,
                // so the in-memory attributes are stale. RELATIONS carries
                // product.category, which the Game column needs.
                'transaction' => new TransactionResource($transaction->fresh(self::RELATIONS)),
                'refund' => new RefundRequestResource($refund->load(['transaction.product', 'user', 'processedBy'])),
            ],
            $refund->method === RefundMethod::BALANCE
                ? 'Refund credited to the member balance'
                : 'Refund queued for manual transfer'
        );
    }

    public function resendCallback(Transaction $transaction, AdminResendCallbackAction $action)
    {
        try {
            $transaction = $action->execute($transaction);
        } catch (InvalidArgumentException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Callback resent successfully'
        );
    }

    public function retry(Transaction $transaction, AdminRetryTransactionAction $action)
    {
        try {
            $transaction = $action->execute($transaction);
        } catch (RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Transaction retried successfully'
        );
    }

    public function resendReceipt(Transaction $transaction, AdminResendReceiptAction $action)
    {
        $transaction = $action->execute($transaction);

        return $this->successResponse(
            new TransactionResource($transaction->load(self::RELATIONS)),
            'Receipt resent successfully'
        );
    }

    public function recap(Request $request, GetTransactionRecapAction $action)
    {
        $period = $request->query('period') === 'monthly' ? 'monthly' : 'daily';

        return $this->successResponse($action->execute($period), 'Transaction recap retrieved successfully');
    }

    /**
     * CSV of the filtered set (no pagination). Binary/stream response — an
     * intentional deviation from the ApiResponse envelope, like the uxiolabs
     * import template.
     */
    public function export(Request $request, ExportTransactionsAction $action): StreamedResponse
    {
        $transactions = $action->execute(
            $request->query('status'),
            $request->query('search'),
            ($v = $request->query('user_id')) !== null ? (int) $v : null,
            ($v = $request->query('product_id')) !== null ? (int) $v : null,
            ($v = $request->query('payment_channel_id')) !== null ? (int) $v : null,
            $request->query('start_date'),
            $request->query('end_date'),
            $request->query('provider_status'),
            $request->query('payment_status'),
        );

        return response()->streamDownload(function () use ($transactions) {
            $out = fopen('php://output', 'w');
            // The two new columns are APPENDED after Status, not inserted, so
            // anything parsing this CSV by leading position keeps working.
            fputcsv($out, ['Invoice', 'Customer', 'Product', 'Status', 'Total', 'Margin', 'Created At', 'Provider Status', 'Payment Status']);
            foreach ($transactions as $t) {
                // Csv::row wraps every cell so a customer-supplied name cannot
                // start a formula in the operator's spreadsheet.
                fputcsv($out, Csv::row([
                    $t->invoice_number,
                    $t->user?->name ?? $t->guest_contact ?? 'Guest',
                    $t->product?->name ?? '',
                    $t->status instanceof \BackedEnum ? $t->status->value : $t->status,
                    $t->amount_total,
                    $t->margin,
                    $t->created_at?->toDateTimeString(),
                    $t->provider_status?->value,
                    GatewayStatus::fromPayment($t->payment?->status)?->value,
                ]));
            }
            fclose($out);
        }, 'transactions.csv', ['Content-Type' => 'text/csv']);
    }
}
