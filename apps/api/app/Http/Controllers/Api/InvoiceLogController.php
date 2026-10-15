<?php

namespace App\Http\Controllers\Api;

use App\Actions\Invoice\GetInvoiceDeliveryLogsAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\Api\InvoiceLog\InvoiceDeliveryLogResource;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;

/**
 * The invoice-delivery trail: which order's receipt went out, over which
 * channel, and whether it arrived.
 */
class InvoiceLogController extends Controller
{
    use ApiResponse;

    public function index(Request $request, GetInvoiceDeliveryLogsAction $action)
    {
        $perPage = min(100, max(1, (int) $request->query('per_page', 15)));

        $logs = $action->execute($perPage, [
            'transaction_id' => $request->query('transaction_id'),
            'channel' => $request->query('channel'),
            'status' => $request->query('status'),
            'search' => $request->query('search'),
            'start_date' => $request->query('start_date'),
            'end_date' => $request->query('end_date'),
        ]);

        return $this->paginatedResponse(
            InvoiceDeliveryLogResource::collection($logs),
            'Invoice delivery logs retrieved successfully'
        );
    }
}
