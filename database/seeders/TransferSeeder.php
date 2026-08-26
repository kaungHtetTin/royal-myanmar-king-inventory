<?php

namespace Database\Seeders;

use App\Enums\TransferStatus;
use App\Models\Product;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseTransfer;
use App\Services\DocumentReferenceGenerator;
use App\Services\RepresentativeTransferPostingService;
use App\Services\WarehouseTransferPostingService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class TransferSeeder extends Seeder
{
    public function run(): void
    {
        $actor = User::query()->where('username', env('SUPER_ADMIN_USERNAME', 'superadmin'))->firstOrFail();
        $products = Product::query()->whereIn('sku', ['DW-1L', 'MW-500ML', 'JW-20L'])->orderBy('id')->get();
        $yangon = Warehouse::query()->where('code', 'YGN-MAIN')->firstOrFail();
        $mandalay = Warehouse::query()->where('code', 'MDY-MAIN')->firstOrFail();
        $request = $this->request($actor);

        $warehouseTransfer = DB::transaction(function () use ($actor, $products, $yangon, $mandalay): WarehouseTransfer {
            $existing = WarehouseTransfer::query()->where('notes', 'Local demo received warehouse transfer.')->first();
            if ($existing) {
                return $existing;
            }
            $transfer = WarehouseTransfer::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('warehouse_transfer', 'WTR'),
                'source_warehouse_id' => $yangon->id,
                'destination_warehouse_id' => $mandalay->id,
                'status' => TransferStatus::Draft,
                'notes' => 'Local demo received warehouse transfer.',
                'created_by' => $actor->id,
            ]);
            foreach ($products as $index => $product) {
                $unit = $product->defaultSellingUnit()->firstOrFail();
                $quantity = [5, 3, 6][$index];
                $transfer->items()->create([
                    'product_id' => $product->id,
                    'quantity' => $quantity * $unit->conversion_factor,
                ]);
            }

            return $transfer;
        });
        if ($warehouseTransfer->status === TransferStatus::Draft) {
            app(WarehouseTransferPostingService::class)->dispatch($warehouseTransfer, $actor, 'local-demo-wtr-dispatch', $request);
            $warehouseTransfer->refresh();
        }
        if ($warehouseTransfer->status === TransferStatus::Dispatched) {
            app(WarehouseTransferPostingService::class)->receive($warehouseTransfer, $actor, 'local-demo-wtr-receive', $request);
        }

        $koAung = SalesRepresentative::query()->where('code', 'SR-001')->firstOrFail();
        $received = $this->representativeTransfer($actor, $products, $yangon, $koAung, 'Local demo received representative transfer.', [10, 4, 10]);
        if ($received->status === TransferStatus::Draft) {
            app(RepresentativeTransferPostingService::class)->dispatch($received, $actor, 'local-demo-rtr-received-dispatch', $request);
            $received->refresh();
        }
        if ($received->status === TransferStatus::Dispatched) {
            app(RepresentativeTransferPostingService::class)->receive($received, $koAung->user, 'local-demo-rtr-received-confirm', $this->request($koAung->user));
        }

        $maSu = SalesRepresentative::query()->where('code', 'SR-002')->firstOrFail();
        $pending = $this->representativeTransfer($actor, $products, $mandalay, $maSu, 'Local demo pending representative transfer.', [2, 1, 2]);
        if ($pending->status === TransferStatus::Draft) {
            app(RepresentativeTransferPostingService::class)->dispatch($pending, $actor, 'local-demo-rtr-pending-dispatch', $request);
        }
    }

    /** @param Collection<int, Product> $products
     * @param  list<int>  $quantities
     */
    private function representativeTransfer(User $actor, $products, Warehouse $warehouse, SalesRepresentative $representative, string $notes, array $quantities): RepresentativeTransfer
    {
        return DB::transaction(function () use ($actor, $products, $warehouse, $representative, $notes, $quantities): RepresentativeTransfer {
            $existing = RepresentativeTransfer::query()->where('notes', $notes)->first();
            if ($existing) {
                return $existing;
            }
            $transfer = RepresentativeTransfer::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('representative_transfer', 'RTR'),
                'source_warehouse_id' => $warehouse->id,
                'sales_representative_id' => $representative->id,
                'status' => TransferStatus::Draft,
                'notes' => $notes,
                'created_by' => $actor->id,
            ]);
            foreach ($products as $index => $product) {
                $unit = $product->defaultSellingUnit()->firstOrFail();
                $transfer->items()->create(['product_id' => $product->id, 'product_unit_id' => $unit->id, 'quantity' => $quantities[$index], 'base_quantity' => $quantities[$index] * $unit->conversion_factor]);
            }

            return $transfer;
        });
    }

    private function request(User $actor): Request
    {
        $request = Request::create('/database/seed', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'TransferSeeder']);
        $request->setUserResolver(fn () => $actor);

        return $request;
    }
}
