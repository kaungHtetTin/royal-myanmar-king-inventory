<?php

namespace Database\Seeders;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Models\Customer;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Services\DocumentReferenceGenerator;
use App\Services\SalePostingService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SaleSeeder extends Seeder
{
    public function run(): void
    {
        $representative = SalesRepresentative::query()->where('code', 'SR-001')->with('user')->firstOrFail();
        $customer = Customer::query()->where('code', 'CUS-ABC')->firstOrFail();
        $products = Product::query()->whereIn('sku', ['DW-1L', 'MW-500ML', 'JW-20L'])->get()->keyBy('sku');
        $request = $this->request($representative->user);

        $cash = $this->sale($representative, $customer, PaymentType::Cash, 'Local demo posted cash sale.', [
            ['product' => $products['DW-1L'], 'quantity' => 4],
            ['product' => $products['MW-500ML'], 'quantity' => 2],
        ]);
        if ($cash->status === SaleStatus::Draft) {
            app(SalePostingService::class)->post($cash, $representative->user, 'local-demo-cash-sale-post', $request);
        }

        $credit = $this->sale($representative, $customer, PaymentType::Credit, 'Local demo posted credit sale.', [
            ['product' => $products['DW-1L'], 'quantity' => 2],
            ['product' => $products['MW-500ML'], 'quantity' => 1],
        ]);
        if ($credit->status === SaleStatus::Draft) {
            app(SalePostingService::class)->post($credit, $representative->user, 'local-demo-credit-sale-post', $request);
        }

        $this->sale($representative, $customer, PaymentType::Cash, 'Local demo draft sale.', [
            ['product' => $products['DW-1L'], 'unit' => 'carton', 'quantity' => 1, 'foc_unit' => 'bottle', 'foc_quantity' => 2],
        ]);
    }

    /** @param list<array{product: Product, quantity: int, unit?: string, foc_unit?: string, foc_quantity?: int}> $lines */
    private function sale(SalesRepresentative $representative, Customer $customer, PaymentType $paymentType, string $notes, array $lines): Sale
    {
        return DB::transaction(function () use ($representative, $customer, $paymentType, $notes, $lines): Sale {
            $existing = Sale::query()->where('notes', $notes)->first();
            if ($existing) {
                return $existing;
            }
            $items = collect($lines)->map(function (array $line) use ($customer): array {
                $unit = isset($line['unit'])
                    ? $line['product']->units()->where('name', $line['unit'])->firstOrFail()
                    : $line['product']->defaultSellingUnit()->firstOrFail();
                $unitPrice = $unit->regionPrices()->where('region_id', $customer->region_id)->value('price');
                if ($unitPrice === null) {
                    throw new \LogicException("A regional price is missing for {$line['product']->sku}.");
                }
                $focUnit = isset($line['foc_unit'])
                    ? $line['product']->units()->where('name', $line['foc_unit'])->firstOrFail()
                    : null;
                $focQuantity = $line['foc_quantity'] ?? 0;

                return [
                    'product_id' => $line['product']->id, 'product_unit_id' => $unit->id,
                    'quantity' => $line['quantity'], 'base_quantity' => $line['quantity'] * $unit->conversion_factor,
                    'unit_price' => $unitPrice, 'line_total' => $line['quantity'] * $unitPrice,
                    'foc_product_unit_id' => $focUnit?->id, 'foc_quantity' => $focQuantity,
                    'foc_base_quantity' => $focQuantity * ($focUnit?->conversion_factor ?? 0),
                ];
            });
            $sale = Sale::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('sale', 'SAL'),
                'trip_id' => Trip::query()->where('sales_representative_id', $representative->id)->where('status', 'operation')->value('id'),
                'sales_representative_id' => $representative->id,
                'warehouse_id' => $representative->primary_warehouse_id,
                'region_id' => $customer->region_id,
                'customer_id' => $customer->id,
                'payment_type' => $paymentType,
                'payment_method' => $paymentType === PaymentType::Cash ? 'cash' : null,
                'total_amount' => $items->sum('line_total'),
                'status' => SaleStatus::Draft,
                'notes' => $notes,
                'created_by' => $representative->user_id,
            ]);
            $sale->items()->createMany($items->all());

            return $sale;
        });
    }

    private function request($actor): Request
    {
        $request = Request::create('/database/seed', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'SaleSeeder']);
        $request->setUserResolver(fn () => $actor);

        return $request;
    }
}
