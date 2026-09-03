<?php

namespace Database\Seeders;

use App\Enums\CustomerPaymentStatus;
use App\Enums\InventoryDocumentStatus;
use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\TransferStatus;
use App\Enums\TripStatus;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockImport;
use App\Models\Trip;
use App\Models\TripExpense;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Services\CashSubmissionService;
use App\Services\CustomerPaymentPostingService;
use App\Services\DocumentReferenceGenerator;
use App\Services\RepresentativeTransferPostingService;
use App\Services\SalePostingService;
use App\Services\StockImportPostingService;
use App\Services\TripWorkflowService;
use Illuminate\Database\Seeder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use LogicException;

class OperationProcessSeeder extends Seeder
{
    private const TRIP_TITLE = 'Nay Pyi Taw complete operation demo';

    private const TRIP_NOTES = 'End-to-end operation process demo.';

    public function run(): void
    {
        $this->call([
            DatabaseSeeder::class,
            WarehouseSeeder::class,
            ProductSeeder::class,
            VehicleSeeder::class,
            SalesRepresentativeSeeder::class,
            CustomerSeeder::class,
        ]);

        $office = User::query()->where('username', env('SUPER_ADMIN_USERNAME', 'superadmin'))->firstOrFail();
        $warehouse = Warehouse::query()->where('code', 'NPT-MAIN')->firstOrFail();
        $representative = SalesRepresentative::query()->where('code', 'SR-003')->with(['user', 'regions'])->firstOrFail();
        $customer = Customer::query()->where('code', 'CUS-NPT01')->firstOrFail();
        $products = Product::query()->whereIn('sku', ['DW-1L', 'MW-500ML', 'JW-20L'])->get()->keyBy('sku');

        $customer->update(['credit_allowed' => true, 'credit_limit' => 2000000]);

        $this->guardMasterData($warehouse, $representative, $customer, $products);
        $vehicle = $this->vehicle($representative);
        $this->openingStock($office, $warehouse, $products);

        $trip = $this->trip($office, $warehouse, $representative, $vehicle);
        if ($trip->status === TripStatus::Completed) {
            return;
        }

        $officeRequest = $this->request($office);
        $representativeRequest = $this->request($representative->user);
        $issue = $this->stockIssue($office, $warehouse, $representative, $trip, $products);

        if ($issue->status === TransferStatus::Draft) {
            app(RepresentativeTransferPostingService::class)->dispatch(
                $issue,
                $office,
                'operation-demo-stock-issue-dispatch',
                $officeRequest,
            );
            $issue->refresh();
        }
        if ($trip->status === TripStatus::Planning) {
            app(TripWorkflowService::class)->start($trip, $office, $officeRequest);
            $trip->refresh();
        }

        if ($trip->status === TripStatus::Operation) {
            $this->sales($trip, $representative, $customer, $products, $representativeRequest);
            $this->creditCollection($trip, $representative, $customer, $representativeRequest);
            $this->expense($trip, $representative->user);
            app(TripWorkflowService::class)->beginEnding($trip, $representative->user, $representativeRequest);
            $trip->refresh();
        }

        if ($trip->status === TripStatus::Ending) {
            $this->returnStock($trip, $office, $warehouse, $representative, $officeRequest);
            $this->submitCash($trip, $office, $representative, $officeRequest, $representativeRequest);
            app(TripWorkflowService::class)->complete(
                $trip,
                $office,
                'Stock, cash, sales, collections, and expenses reconciled by the operation demo seeder.',
                $officeRequest,
            );
        }
    }

    /** @param Collection<string, Product> $products */
    private function guardMasterData(Warehouse $warehouse, SalesRepresentative $representative, Customer $customer, Collection $products): void
    {
        if ($products->count() !== 3) {
            throw new LogicException('The operation demo requires all three seeded products.');
        }
        if ($representative->primary_warehouse_id !== $warehouse->id || $customer->warehouse_id !== $warehouse->id) {
            throw new LogicException('The operation demo representative and customer must belong to NPT-MAIN.');
        }
        if ($customer->region_id === null || ! $representative->regions->contains('id', $customer->region_id)) {
            throw new LogicException('The operation demo customer region must be assigned to SR-003.');
        }
    }

    private function vehicle(SalesRepresentative $representative): Vehicle
    {
        Vehicle::query()
            ->where('sales_representative_id', $representative->id)
            ->where('vehicle_number', '!=', 'NPT-7H-2201')
            ->update(['sales_representative_id' => null]);

        return Vehicle::query()->updateOrCreate(
            ['vehicle_number' => 'NPT-7H-2201'],
            [
                'vehicle_type' => 'Van',
                'brand' => 'Toyota',
                'model' => 'TownAce',
                'sales_representative_id' => $representative->id,
                'is_active' => true,
                'notes' => 'Vehicle used by the end-to-end operation process demo.',
            ],
        );
    }

    /** @param Collection<string, Product> $products */
    private function openingStock(User $office, Warehouse $warehouse, Collection $products): void
    {
        $import = DB::transaction(function () use ($office, $warehouse, $products): StockImport {
            $existing = StockImport::query()->where('notes', 'End-to-end operation demo opening stock.')->first();
            if ($existing) {
                return $existing;
            }

            $import = StockImport::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('stock_import', 'IMP'),
                'warehouse_id' => $warehouse->id,
                'status' => InventoryDocumentStatus::Draft,
                'notes' => 'End-to-end operation demo opening stock.',
                'created_by' => $office->id,
            ]);

            foreach (['DW-1L' => 120, 'MW-500ML' => 96, 'JW-20L' => 20] as $sku => $quantity) {
                $product = $products->get($sku);
                $baseUnit = $product->baseUnit()->firstOrFail();
                $import->items()->create([
                    'product_id' => $product->id,
                    'product_unit_id' => $baseUnit->id,
                    'quantity' => $quantity,
                    'base_quantity' => $quantity,
                ]);
            }

            return $import;
        });

        if ($import->status === InventoryDocumentStatus::Draft) {
            app(StockImportPostingService::class)->post(
                $import,
                $office,
                'operation-demo-opening-stock-post',
                $this->request($office),
            );
        }
    }

    private function trip(User $office, Warehouse $warehouse, SalesRepresentative $representative, Vehicle $vehicle): Trip
    {
        return Trip::query()->firstOrCreate(
            ['sales_representative_id' => $representative->id, 'notes' => self::TRIP_NOTES],
            [
                'reference' => app(DocumentReferenceGenerator::class)->next('trip', 'TRP'),
                'title' => self::TRIP_TITLE,
                'warehouse_id' => $warehouse->id,
                'region_id' => $representative->regions->firstWhere('name', 'Nay Pyi Taw North')?->id
                    ?? $representative->regions->firstOrFail()->id,
                'vehicle_id' => $vehicle->id,
                'status' => TripStatus::Planning,
                'opening_cash_balance' => (int) RepresentativeCashBalance::query()
                    ->where('sales_representative_id', $representative->id)
                    ->value('amount'),
                'created_by' => $office->id,
            ],
        );
    }

    /** @param Collection<string, Product> $products */
    private function stockIssue(User $office, Warehouse $warehouse, SalesRepresentative $representative, Trip $trip, Collection $products): RepresentativeTransfer
    {
        return DB::transaction(function () use ($office, $warehouse, $representative, $trip, $products): RepresentativeTransfer {
            $existing = RepresentativeTransfer::query()
                ->where('trip_id', $trip->id)
                ->where('direction', 'issue')
                ->where('notes', 'End-to-end operation demo stock issue.')
                ->first();
            if ($existing) {
                return $existing;
            }

            $issue = RepresentativeTransfer::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('representative_transfer', 'RTR'),
                'trip_id' => $trip->id,
                'direction' => 'issue',
                'source_warehouse_id' => $warehouse->id,
                'sales_representative_id' => $representative->id,
                'status' => TransferStatus::Draft,
                'notes' => 'End-to-end operation demo stock issue.',
                'created_by' => $office->id,
            ]);

            foreach ([
                'DW-1L' => ['quantity' => 4, 'foc_quantity' => 2],
                'MW-500ML' => ['quantity' => 2, 'foc_quantity' => 0],
                'JW-20L' => ['quantity' => 10, 'foc_quantity' => 0],
            ] as $sku => $quantities) {
                $product = $products->get($sku);
                $unit = $product->defaultSellingUnit()->firstOrFail();
                $focUnit = $quantities['foc_quantity'] > 0 ? $product->baseUnit()->firstOrFail() : null;
                $issue->items()->create([
                    'product_id' => $product->id,
                    'product_unit_id' => $unit->id,
                    'quantity' => $quantities['quantity'],
                    'base_quantity' => $quantities['quantity'] * $unit->conversion_factor,
                    'foc_product_unit_id' => $focUnit?->id,
                    'foc_quantity' => $quantities['foc_quantity'],
                    'foc_base_quantity' => $quantities['foc_quantity'] * ($focUnit?->conversion_factor ?? 0),
                ]);
            }

            return $issue;
        });
    }

    /** @param Collection<string, Product> $products */
    private function sales(Trip $trip, SalesRepresentative $representative, Customer $customer, Collection $products, Request $request): void
    {
        $sales = [
            [
                'notes' => 'End-to-end operation demo cash sale.',
                'payment_type' => PaymentType::Cash,
                'payment_method' => 'cash',
                'lines' => [
                    ['product' => $products->get('DW-1L'), 'unit' => 'carton', 'quantity' => 1],
                    ['product' => $products->get('MW-500ML'), 'unit' => 'pack', 'quantity' => 1],
                ],
            ],
            [
                'notes' => 'End-to-end operation demo credit sale.',
                'payment_type' => PaymentType::Credit,
                'payment_method' => null,
                'lines' => [
                    ['product' => $products->get('DW-1L'), 'unit' => 'bottle', 'quantity' => 6],
                    ['product' => $products->get('JW-20L'), 'unit' => 'jar', 'quantity' => 2],
                ],
            ],
            [
                'notes' => 'End-to-end operation demo banking sale with FOC.',
                'payment_type' => PaymentType::Cash,
                'payment_method' => 'banking',
                'lines' => [
                    ['product' => $products->get('DW-1L'), 'unit' => 'carton', 'quantity' => 1, 'foc_unit' => 'bottle', 'foc_quantity' => 2],
                ],
            ],
        ];

        foreach ($sales as $index => $definition) {
            $sale = $this->sale($trip, $representative, $customer, $definition);
            if ($sale->status === SaleStatus::Draft) {
                app(SalePostingService::class)->post(
                    $sale,
                    $representative->user,
                    'operation-demo-sale-'.($index + 1).'-post',
                    $request,
                );
            }
        }
    }

    /** @param array{notes: string, payment_type: PaymentType, payment_method: ?string, lines: list<array{product: Product, unit: string, quantity: int, foc_unit?: string, foc_quantity?: int}>} $definition */
    private function sale(Trip $trip, SalesRepresentative $representative, Customer $customer, array $definition): Sale
    {
        return DB::transaction(function () use ($trip, $representative, $customer, $definition): Sale {
            $existing = Sale::query()->where('trip_id', $trip->id)->where('notes', $definition['notes'])->first();
            if ($existing) {
                return $existing;
            }

            $items = collect($definition['lines'])->map(function (array $line) use ($customer): array {
                $unit = $line['product']->units()->where('name', $line['unit'])->firstOrFail();
                $unitPrice = $unit->regionPrices()->where('region_id', $customer->region_id)->value('price');
                if ($unitPrice === null) {
                    throw new LogicException("A regional price is missing for {$line['product']->sku}.");
                }

                $gross = $line['quantity'] * $unitPrice;
                $discountPercentage = (float) $line['product']->discount_percentage;
                $discountAmount = (int) round($gross * $discountPercentage / 100);
                $focUnit = isset($line['foc_unit'])
                    ? $line['product']->units()->where('name', $line['foc_unit'])->firstOrFail()
                    : null;
                $focQuantity = $line['foc_quantity'] ?? 0;

                return [
                    'product_id' => $line['product']->id,
                    'product_unit_id' => $unit->id,
                    'quantity' => $line['quantity'],
                    'base_quantity' => $line['quantity'] * $unit->conversion_factor,
                    'unit_price' => $unitPrice,
                    'discount_percentage' => $discountPercentage,
                    'discount_amount' => $discountAmount,
                    'line_total' => $gross - $discountAmount,
                    'foc_product_unit_id' => $focUnit?->id,
                    'foc_quantity' => $focQuantity,
                    'foc_base_quantity' => $focQuantity * ($focUnit?->conversion_factor ?? 0),
                ];
            });

            $sale = Sale::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('sale', 'SAL'),
                'trip_id' => $trip->id,
                'sales_representative_id' => $representative->id,
                'warehouse_id' => $trip->warehouse_id,
                'region_id' => $trip->region_id,
                'customer_id' => $customer->id,
                'payment_type' => $definition['payment_type'],
                'payment_method' => $definition['payment_method'],
                'total_amount' => $items->sum('line_total'),
                'status' => SaleStatus::Draft,
                'notes' => $definition['notes'],
                'creation_latitude' => 19.7633,
                'creation_longitude' => 96.0785,
                'location_accuracy_meters' => 12,
                'location_captured_at' => now(),
                'created_by' => $representative->user_id,
            ]);
            $sale->items()->createMany($items->all());

            return $sale;
        });
    }

    private function creditCollection(Trip $trip, SalesRepresentative $representative, Customer $customer, Request $request): void
    {
        $payment = DB::transaction(function () use ($trip, $representative, $customer): CustomerPayment {
            $existing = CustomerPayment::query()
                ->where('trip_id', $trip->id)
                ->where('notes', 'End-to-end operation demo credit collection.')
                ->first();
            if ($existing) {
                return $existing;
            }

            return CustomerPayment::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('customer_payment', 'PAY'),
                'trip_id' => $trip->id,
                'sales_representative_id' => $representative->id,
                'warehouse_id' => $trip->warehouse_id,
                'customer_id' => $customer->id,
                'amount' => 4000,
                'payment_date' => now()->toDateString(),
                'payment_method' => 'cash',
                'notes' => 'End-to-end operation demo credit collection.',
                'status' => CustomerPaymentStatus::Draft,
                'received_by' => $representative->user_id,
                'created_by' => $representative->user_id,
            ]);
        });

        if ($payment->status === CustomerPaymentStatus::Draft) {
            app(CustomerPaymentPostingService::class)->post(
                $payment,
                $representative->user,
                'operation-demo-credit-collection-post',
                $request,
            );
        }
    }

    private function expense(Trip $trip, User $representativeUser): void
    {
        TripExpense::query()->firstOrCreate(
            ['trip_id' => $trip->id, 'description' => 'Fuel and route parking'],
            [
                'amount' => 1500,
                'spent_at' => now(),
                'notes' => 'End-to-end operation demo trip expense.',
                'created_by' => $representativeUser->id,
            ],
        );
    }

    private function returnStock(Trip $trip, User $office, Warehouse $warehouse, SalesRepresentative $representative, Request $request): void
    {
        $return = DB::transaction(function () use ($trip, $office, $warehouse, $representative): ?RepresentativeTransfer {
            $existing = RepresentativeTransfer::query()
                ->where('trip_id', $trip->id)
                ->where('direction', 'return')
                ->where('notes', 'End-to-end operation demo stock return.')
                ->first();
            if ($existing) {
                return $existing;
            }

            $balances = RepresentativeInventory::query()
                ->where('sales_representative_id', $representative->id)
                ->where(fn ($query) => $query->where('quantity', '>', 0)->orWhere('foc_quantity', '>', 0))
                ->with('product.baseUnit')
                ->orderBy('product_id')
                ->get();
            if ($balances->isEmpty()) {
                return null;
            }

            $return = RepresentativeTransfer::query()->create([
                'reference' => app(DocumentReferenceGenerator::class)->next('representative_return', 'RRT'),
                'trip_id' => $trip->id,
                'direction' => 'return',
                'source_warehouse_id' => $warehouse->id,
                'sales_representative_id' => $representative->id,
                'status' => TransferStatus::Draft,
                'notes' => 'End-to-end operation demo stock return.',
                'created_by' => $office->id,
            ]);

            foreach ($balances as $balance) {
                $baseUnit = $balance->product->baseUnit;
                $return->items()->create([
                    'product_id' => $balance->product_id,
                    'product_unit_id' => $baseUnit->id,
                    'quantity' => $balance->quantity,
                    'base_quantity' => $balance->quantity,
                    'foc_product_unit_id' => $balance->foc_quantity > 0 ? $baseUnit->id : null,
                    'foc_quantity' => $balance->foc_quantity,
                    'foc_base_quantity' => $balance->foc_quantity,
                ]);
            }

            return $return;
        });

        if ($return?->status === TransferStatus::Draft) {
            app(RepresentativeTransferPostingService::class)->postReturn(
                $return,
                $office,
                'operation-demo-stock-return-post',
                $request,
            );
        }
    }

    private function submitCash(Trip $trip, User $office, SalesRepresentative $representative, Request $officeRequest, Request $representativeRequest): void
    {
        $submission = CashSubmission::query()
            ->where('trip_id', $trip->id)
            ->where('notes', 'End-to-end operation demo cash handover.')
            ->first();

        if (! $submission) {
            $amount = (int) RepresentativeCashBalance::query()
                ->where('sales_representative_id', $representative->id)
                ->value('amount');
            if ($amount === 0) {
                return;
            }

            $result = app(CashSubmissionService::class)->create(
                $representative,
                $amount,
                'End-to-end operation demo cash handover.',
                $representative->user,
                'operation-demo-cash-handover-create',
                $representativeRequest,
            );
            $submission = CashSubmission::query()->findOrFail($result['id']);
        }

        if ($submission->status->value === 'pending') {
            app(CashSubmissionService::class)->confirm(
                $submission,
                $office,
                'operation-demo-cash-handover-confirm',
                $officeRequest,
            );
        }
    }

    private function request(User $actor): Request
    {
        $request = Request::create('/database/seed/operation-process', 'POST', server: [
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_USER_AGENT' => 'OperationProcessSeeder',
        ]);
        $request->setUserResolver(fn () => $actor);

        return $request;
    }
}
