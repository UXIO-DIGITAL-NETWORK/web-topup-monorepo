<?php

namespace App\Actions\Transaction;

use App\Enums\GatewayStatus;
use App\Enums\ProviderStatus;
use App\Enums\TransactionStatus;
use App\Models\Transaction;

/**
 * Counts backing the admin table's "needs attention" filter pills — the
 * three real transaction statuses an operator would act on, not a
 * settlement-state taxonomy the backend has no data for.
 *
 * The four top-level keys are frozen. The admin SPA reads them directly and the
 * three repos deploy independently, so renaming one would blank the pills for
 * however long the old frontend is still live. The provider/payment breakdowns
 * are therefore NESTED and additive.
 */
class GetTransactionStatusCountsAction
{
    public function execute(): array
    {
        // One pass, grouped three ways. Cardinality is at most 7 × 8 × 5, so the
        // fold below is cheap and this stays a single scan rather than three.
        $rows = Transaction::query()
            ->leftJoin('payments as pay', 'pay.transaction_id', '=', 'transactions.id')
            ->selectRaw(
                'transactions.status as status, transactions.provider_status as provider_status, '
                .GatewayStatus::sqlCaseForPayments('pay').' as gateway_status, COUNT(*) as cnt'
            )
            ->groupBy('transactions.status', 'transactions.provider_status', 'gateway_status')
            ->toBase()
            ->get();

        $byStatus = [];
        $byProvider = [];
        $byGateway = [];

        foreach ($rows as $row) {
            $cnt = (int) $row->cnt;
            $byStatus[$row->status] = ($byStatus[$row->status] ?? 0) + $cnt;
            $byProvider[$row->provider_status] = ($byProvider[$row->provider_status] ?? 0) + $cnt;
            // No payment row at all is a real answer, distinct from "not paid yet".
            $gateway = $row->gateway_status ?? 'NONE';
            $byGateway[$gateway] = ($byGateway[$gateway] ?? 0) + $cnt;
        }

        return [
            'pending' => (int) ($byStatus[TransactionStatus::PENDING->value] ?? 0),
            'processing' => (int) ($byStatus[TransactionStatus::PROCESSING->value] ?? 0),
            // The "it worked" pill. Additive: the admin reads the other keys by
            // name, so adding one changes nothing that was already there.
            'completed' => (int) ($byStatus[TransactionStatus::COMPLETED->value] ?? 0),
            'failed_provider' => (int) ($byStatus[TransactionStatus::FAILED_PROVIDER->value] ?? 0),
            // A refunded order leaves FAILED_PROVIDER, so without its own pill
            // it would simply vanish from the operator's view — and the failed
            // count would keep shrinking with no visible reason.
            'refunded' => (int) ($byStatus[TransactionStatus::REFUNDED->value] ?? 0),

            'provider' => collect(ProviderStatus::cases())
                ->mapWithKeys(fn (ProviderStatus $c) => [
                    strtolower($c->value) => (int) ($byProvider[$c->value] ?? 0),
                ])->all(),

            'payment' => collect(GatewayStatus::cases())
                ->mapWithKeys(fn (GatewayStatus $c) => [
                    strtolower($c->value) => (int) ($byGateway[$c->value] ?? 0),
                ])->put('none', (int) ($byGateway['NONE'] ?? 0))->all(),
        ];
    }
}
