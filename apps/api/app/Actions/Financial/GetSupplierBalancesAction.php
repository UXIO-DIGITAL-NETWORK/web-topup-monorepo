<?php

namespace App\Actions\Financial;

use App\Contracts\SupplierGateway;
use App\Models\Supplier;
use App\Support\Uxiolabs\UxiolabsSupplier;
use Exception;
use Illuminate\Support\Facades\Log;

/**
 * The balances the platform can actually ask for.
 *
 * Only uxiolabs has a live balance-check integration (UxiolabsService). The
 * other seeded rows ("VIP Reseller", "Internal System" — see SupplierSeeder)
 * have no API behind them, so listing them put a permanent "—" on the Financial
 * card: that reads as a channel that is down, rather than one that was never
 * wired.
 *
 * They are left out of the list rather than deleted — `Internal System` is the
 * platform's own supplier for products that come from no external provider
 * (`is_system`, and protected by the API), and `supplier_products` references
 * `suppliers` with cascadeOnDelete.
 *
 * A connected supplier that cannot be reached still reports null; that is a real
 * signal and is kept.
 */
class GetSupplierBalancesAction
{
    public function __construct(private readonly SupplierGateway $uxiolabsService) {}

    public function execute(): array
    {
        return Supplier::query()
            ->orderBy('name')
            ->get()
            ->filter(fn (Supplier $supplier) => UxiolabsSupplier::isNamed($supplier->name))
            ->values()
            ->map(fn (Supplier $supplier) => [
                'id' => $supplier->id,
                'name' => $supplier->name,
                'balance' => $this->uxiolabsBalance(),
            ])
            ->all();
    }

    private function uxiolabsBalance(): ?float
    {
        try {
            // Cached (60s) so the admin panel + integration poll never hit uxiolabs
            // live on every request — that live call is what hangs the server.
            $data = $this->uxiolabsService->getBalanceCached();

            return isset($data['saldo']) && is_numeric($data['saldo']) ? (float) $data['saldo'] : null;
        } catch (Exception $e) {
            Log::warning('GetSupplierBalancesAction: uxiolabs balance check failed', ['message' => $e->getMessage()]);

            return null;
        }
    }
}
