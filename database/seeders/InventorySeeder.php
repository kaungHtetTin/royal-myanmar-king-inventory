<?php

namespace Database\Seeders;

use App\Enums\InventoryDocumentStatus;
use App\Models\Product;
use App\Models\StockImport;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\DocumentReferenceGenerator;
use App\Services\StockImportPostingService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventorySeeder extends Seeder
{
    public function run(): void
    {
        $actor = User::query()->where('username', env('SUPER_ADMIN_USERNAME', 'superadmin'))->firstOrFail();
        $warehouse = Warehouse::query()->where('code', 'YGN-MAIN')->firstOrFail();
        $products = Product::query()->whereIn('sku', ['DW-1L', 'MW-500ML', 'JW-20L'])->orderBy('id')->get();
        $import = DB::transaction(function () use ($actor, $warehouse, $products): StockImport {
            $existing = StockImport::query()->where('notes', 'Local demo opening stock.')->first();
            if ($existing) {
                return $existing;
            }
            $import = StockImport::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('stock_import', 'IMP'),
                'warehouse_id' => $warehouse->id,
                'status' => InventoryDocumentStatus::Draft,
                'notes' => 'Local demo opening stock.',
                'created_by' => $actor->id,
            ]);
            $quantities = [240, 180, 60];
            foreach ($products as $index => $product) {
                $import->items()->create(['product_id' => $product->id, 'quantity' => $quantities[$index] ?? 50]);
            }

            return $import;
        });

        if ($import->status === InventoryDocumentStatus::Draft) {
            $request = Request::create('/database/seed', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'InventorySeeder']);
            $request->setUserResolver(fn () => $actor);
            app(StockImportPostingService::class)->post($import, $actor, 'local-demo-opening-stock', $request);
        }
    }
}
