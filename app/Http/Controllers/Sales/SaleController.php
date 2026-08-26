<?php

namespace App\Http\Controllers\Sales;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\SaleResource;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\IdempotencyService;
use App\Services\SalePostingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SaleController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly DocumentReferenceGenerator $references,
        private readonly IdempotencyService $idempotency,
        private readonly SalePostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(SaleStatus::class)],
            'payment_type' => ['nullable', Rule::enum(PaymentType::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $representative = $this->representative($request);
        $query = Sale::query()->with($this->relations())->withSum('items as total_quantity', 'quantity')
            ->where('sales_representative_id', $representative->id)
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('reference', 'like', "%{$search}%")->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"))))
            ->latest('id');

        return SaleResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function show(Request $request, Sale $sale): SaleResource
    {
        $representative = $this->representative($request);
        $this->assertOwn($sale, $representative);

        return new SaleResource($this->load($sale));
    }

    public function options(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $regionIds = $representative->regions()->where('regions.is_active', true)->pluck('regions.id');
        $customers = Customer::query()->with(['creditBalance', 'way.region:id,warehouse_id,name'])
            ->whereHas('way', fn ($way) => $way->where('is_active', true)->whereIn('region_id', $regionIds))
            ->where('is_active', true)->orderBy('name')->get()
            ->map(function (Customer $customer): array {
                $outstanding = (int) ($customer->creditBalance?->outstanding_amount ?? 0);

                return ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->name, 'way' => ['id' => $customer->way->id, 'code' => $customer->way->code, 'name' => $customer->way->name, 'region' => $customer->way->region->only(['id', 'name', 'warehouse_id'])], 'credit_allowed' => $customer->credit_allowed, 'credit_limit' => $customer->credit_limit, 'outstanding_amount' => $outstanding, 'available_credit' => max(0, $customer->credit_limit - $outstanding)];
            });
        $products = RepresentativeInventory::query()->with(['product.units' => fn ($query) => $query->where('is_active', true)->with(['regionPrices' => fn ($prices) => $prices->whereIn('region_id', $regionIds)])])
            ->where('sales_representative_id', $representative->id)->where(fn ($query) => $query->where('quantity', '>', 0)->orWhere('foc_quantity', '>', 0))
            ->whereHas('product', fn ($query) => $query->where('is_active', true))->get()->sortBy('product.name')->values()->map(fn (RepresentativeInventory $inventory) => [
                'id' => $inventory->product->id, 'sku' => $inventory->product->sku, 'name' => $inventory->product->name,
                'unit' => $inventory->product->unit, 'quantity' => $inventory->quantity, 'foc_quantity' => $inventory->foc_quantity,
                'units' => $inventory->product->units->map(fn (ProductUnit $unit) => [
                    'id' => $unit->id, 'name' => $unit->name, 'conversion_factor' => $unit->conversion_factor,
                    'is_base' => $unit->is_base, 'is_default_selling' => $unit->is_default_selling,
                    'prices' => $unit->regionPrices->map(fn ($price) => ['region_id' => $price->region_id, 'price' => $price->price])->values(),
                ])->values(),
                'selling_price' => (int) ($inventory->product->units->firstWhere('is_default_selling', true)?->regionPrices->first()?->price ?? 0),
            ]);
        $cashHold = (int) RepresentativeCashBalance::query()->where('sales_representative_id', $representative->id)->value('amount');

        return response()->json(['representative' => ['id' => $representative->id, 'code' => $representative->code, 'name' => $representative->name, 'regions' => $representative->regions()->with('ways')->get()], 'customers' => $customers, 'products' => $products, 'cash_hold' => $cashHold]);
    }

    public function store(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $data = $request->validate($this->rules());
        $result = $this->idempotency->execute($request->user(), 'sale:create', $this->idempotencyKey($request), function () use ($request, $representative, $data): array {
            [$customer, $items, $total] = $this->preparedDraft($representative, $data);
            $sale = Sale::query()->create(['reference' => $this->references->next('sale', 'SAL'), 'sales_representative_id' => $representative->id, 'warehouse_id' => $customer->way->region->warehouse_id, 'region_id' => $customer->way->region_id, 'way_id' => $customer->way_id, 'customer_id' => $customer->id, 'payment_type' => $data['payment_type'], 'total_amount' => $total, 'status' => SaleStatus::Draft, 'notes' => $data['notes'] ?? null, 'created_by' => $request->user()->id]);
            $sale->items()->createMany($items);
            $this->auditLogger->record($request, 'sale.created', $request->user(), $sale, ['new' => $data, 'server_total' => $total]);

            return ['id' => $sale->id];
        });
        $sale = Sale::query()->findOrFail($result['id']);

        return (new SaleResource($this->load($sale)))->response()->setStatusCode(201);
    }

    public function update(Request $request, Sale $sale): SaleResource
    {
        $representative = $this->representative($request);
        $this->assertOwn($sale, $representative);
        $data = $request->validate($this->rules());
        [$customer, $items, $total] = $this->preparedDraft($representative, $data);
        DB::transaction(function () use ($request, $sale, $customer, $data, $items, $total): void {
            $sale = Sale::query()->lockForUpdate()->findOrFail($sale->id);
            if ($sale->status !== SaleStatus::Draft) {
                throw new DomainConflictException('Posted sales are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $old = $sale->load('items')->toArray();
            $sale->update(['warehouse_id' => $customer->way->region->warehouse_id, 'region_id' => $customer->way->region_id, 'way_id' => $customer->way_id, 'customer_id' => $customer->id, 'payment_type' => $data['payment_type'], 'total_amount' => $total, 'notes' => $data['notes'] ?? null]);
            $sale->items()->delete();
            $sale->items()->createMany($items);
            $this->auditLogger->record($request, 'sale.updated', $request->user(), $sale, ['old' => $old, 'new' => $data, 'server_total' => $total]);
        });

        return new SaleResource($this->load($sale));
    }

    public function post(Request $request, Sale $sale): SaleResource
    {
        $representative = $this->representative($request);
        $this->assertOwn($sale, $representative);
        $this->posting->post($sale, $request->user(), $this->idempotencyKey($request), $request);

        return new SaleResource($this->load($sale));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return ['customer_id' => ['required', 'integer', 'exists:customers,id'], 'payment_type' => ['required', Rule::enum(PaymentType::class)], 'notes' => ['nullable', 'string', 'max:2000'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'], 'items.*.product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'], 'items.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'], 'items.*.foc_product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'], 'items.*.foc_quantity' => ['nullable', 'integer', 'min:0', 'max:4294967295']];
    }

    /** @param array<string, mixed> $data
     * @return array{Customer, list<array<string, int>>, int}
     */
    private function preparedDraft(SalesRepresentative $representative, array $data): array
    {
        $customer = Customer::query()->with('way.region')->whereKey($data['customer_id'])->where('is_active', true)
            ->whereHas('way', fn ($way) => $way->where('is_active', true)->whereIn('region_id', $representative->regions()->where('regions.is_active', true)->select('regions.id')))->firstOrFail();
        $products = Product::query()->with(['units.regionPrices'])->whereIn('id', collect($data['items'])->pluck('product_id'))->where('is_active', true)->get()->keyBy('id');
        if ($products->count() !== count($data['items'])) {
            throw ValidationException::withMessages(['items' => ['Every sale product must be active and available for selection.']]);
        }
        $items = collect($data['items'])->map(function (array $item) use ($products, $customer): array {
            $product = $products->get($item['product_id']);
            $unit = $product->units->firstWhere('id', $item['product_unit_id'] ?? null) ?? $product->units->firstWhere('is_default_selling', true);
            $price = $unit?->regionPrices->firstWhere('region_id', $customer->way->region_id);
            if (! $unit?->is_active || ! $price) {
                throw ValidationException::withMessages(['items' => ['This product/unit has no active price for the customer region.']]);
            }
            $focQuantity = (int) ($item['foc_quantity'] ?? 0);
            $focUnit = $focQuantity ? ($product->units->firstWhere('id', $item['foc_product_unit_id'] ?? null) ?? $unit) : null;
            if ($focQuantity && ! $focUnit?->is_active) {
                throw ValidationException::withMessages(['items' => ['FOC must use an active unit of the same product.']]);
            }

            return ['product_id' => (int) $item['product_id'], 'product_unit_id' => $unit->id, 'quantity' => (int) $item['quantity'], 'base_quantity' => (int) $item['quantity'] * $unit->conversion_factor, 'unit_price' => (int) $price->price, 'line_total' => (int) $price->price * (int) $item['quantity'], 'foc_product_unit_id' => $focUnit?->id, 'foc_quantity' => $focQuantity, 'foc_base_quantity' => $focQuantity * ($focUnit?->conversion_factor ?? 0)];
        })->all();

        return [$customer, $items, (int) collect($items)->sum('line_total')];
    }

    private function representative(Request $request): SalesRepresentative
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);

        return $representative;
    }

    private function assertOwn(Sale $sale, SalesRepresentative $representative): void
    {
        abort_unless($sale->sales_representative_id === $representative->id, 403);
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['representative.regions', 'warehouse', 'region', 'way.region', 'customer.way.region', 'items.product', 'items.unit', 'items.focUnit', 'creator', 'poster', 'voider'];
    }

    private function load(Sale $sale): Sale
    {
        return $sale->fresh($this->relations());
    }
}
