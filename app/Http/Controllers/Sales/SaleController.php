<?php

namespace App\Http\Controllers\Sales;

use App\Enums\PaymentType;
use App\Enums\SaleStatus;
use App\Enums\TripStatus;
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
use App\Models\Trip;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\IdempotencyService;
use App\Services\PaymentMethodRegistry;
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
        private readonly PaymentMethodRegistry $paymentMethods,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'trip_id' => ['nullable', 'integer', 'exists:trips,id'],
            'status' => ['nullable', Rule::enum(SaleStatus::class)],
            'payment_type' => ['nullable', Rule::enum(PaymentType::class)],
            'period' => ['nullable', Rule::in(['today', 'range'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $representative = $this->representative($request);
        $query = Sale::query()->where('sales_representative_id', $representative->id)
            ->when($data['customer_id'] ?? null, fn ($query, $id) => $query->where('customer_id', $id))
            ->when($data['product_id'] ?? null, fn ($query, $id) => $query->whereHas('items', fn ($items) => $items->where('product_id', $id)))
            ->when($data['trip_id'] ?? null, fn ($query, $id) => $query->where('trip_id', $id))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['payment_type'] ?? null, fn ($query, $type) => $query->where('payment_type', $type))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($inner) => $inner->where('reference', 'like', "%{$search}%")->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"))));

        if (($data['period'] ?? null) === 'today') {
            $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), today());
        } else {
            $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '>=', $date))
                ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '<=', $date));
        }

        $posted = (clone $query)->where('status', SaleStatus::Posted);
        $totals = $posted->selectRaw(
            'COALESCE(SUM(total_amount), 0) total, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) cash, COALESCE(SUM(CASE WHEN payment_type = ? THEN total_amount ELSE 0 END), 0) credit',
            [PaymentType::Cash->value, PaymentType::Credit->value],
        )->first();
        $units = (int) (clone $query)->where('sales.status', SaleStatus::Posted)
            ->join('sale_items', 'sale_items.sale_id', '=', 'sales.id')->sum('sale_items.base_quantity');

        $documents = (clone $query)->with($this->relations())->withSum('items as total_quantity', 'quantity')
            ->latest('id')->paginate($data['per_page'] ?? 20)->withQueryString();

        return SaleResource::collection($documents)
            ->additional(['summary' => [
                'gross_sales' => (int) $totals->total,
                'cash_sales' => (int) $totals->cash,
                'credit_sales' => (int) $totals->credit,
                'units_sold' => $units,
            ]]);
    }

    public function historyOptions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'period' => ['nullable', Rule::in(['today', 'range'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $representative = $this->representative($request);
        $sales = fn ($query) => $query->where('sales_representative_id', $representative->id);
        $salesDuringDuration = function ($query) use ($data, $representative): void {
            $query->where('sales_representative_id', $representative->id);

            if (($data['period'] ?? null) === 'today') {
                $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), today());

                return;
            }

            $query->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '>=', $date))
                ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate(DB::raw('COALESCE(sales.posted_at, sales.created_at)'), '<=', $date));
        };

        return response()->json([
            'customers' => Customer::query()->whereHas('sales', $sales)->orderBy('name')->get(['id', 'code', 'name']),
            'products' => Product::query()->whereHas('saleItems.sale', $sales)->orderBy('name')->get(['id', 'sku', 'name', 'unit']),
            'trips' => Trip::query()->where('sales_representative_id', $representative->id)
                ->when(
                    ($data['period'] ?? null) || ($data['date_from'] ?? null) || ($data['date_to'] ?? null),
                    fn ($query) => $query->whereHas('sales', $salesDuringDuration),
                )
                ->latest('id')->get(['id', 'reference', 'title']),
        ]);
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
        $trip = $this->operatingTrip($representative);
        $regionIds = collect([$trip->region_id]);
        $customers = Customer::query()->with(['creditBalance', 'assignedRegion:id,warehouse_id,name'])
            ->whereIn('region_id', $regionIds)
            ->where('is_active', true)->orderBy('name')->get()
            ->map(function (Customer $customer): array {
                $outstanding = (int) ($customer->creditBalance?->outstanding_amount ?? 0);

                return ['id' => $customer->id, 'code' => $customer->code, 'name' => $customer->name, 'region' => $customer->assignedRegion->only(['id', 'name', 'warehouse_id']), 'credit_allowed' => $customer->credit_allowed, 'credit_limit' => $customer->credit_limit, 'outstanding_amount' => $outstanding, 'available_credit' => max(0, $customer->credit_limit - $outstanding)];
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

        return response()->json(['trip' => ['id' => $trip->id, 'reference' => $trip->reference, 'title' => $trip->title, 'status' => $trip->status->value, 'region' => $trip->region?->only(['id', 'name']), 'warehouse' => $trip->warehouse?->only(['id', 'code', 'name'])], 'representative' => ['id' => $representative->id, 'code' => $representative->code, 'name' => $representative->name, 'regions' => $representative->regions()->get()], 'customers' => $customers, 'products' => $products, 'payment_methods' => $this->paymentMethods->active(), 'cash_hold' => $cashHold]);
    }

    public function store(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $trip = $this->operatingTrip($representative);
        if ($request->input('payment_type') === PaymentType::Cash->value && ! $request->filled('payment_method')) {
            $request->merge(['payment_method' => $this->paymentMethods->defaultKey()]);
        }
        $data = $request->validate($this->rules(true));
        $result = $this->idempotency->execute($request->user(), 'sale:create', $this->idempotencyKey($request), function () use ($request, $representative, $trip, $data): array {
            [$customer, $items, $total] = $this->preparedDraft($representative, $data, $trip);
            $sale = Sale::query()->create(['reference' => $this->references->next('sale', 'SAL'), 'trip_id' => $trip->id, 'sales_representative_id' => $representative->id, 'warehouse_id' => $customer->assignedRegion->warehouse_id, 'region_id' => $customer->region_id, 'customer_id' => $customer->id, 'payment_type' => $data['payment_type'], 'payment_method' => $data['payment_type'] === PaymentType::Cash->value ? $data['payment_method'] : null, 'total_amount' => $total, 'promotion_title' => $data['promotion_title'] ?? null, 'promotion_amount' => $data['promotion_amount'] ?? 0, 'status' => SaleStatus::Draft, 'notes' => $data['notes'] ?? null, 'creation_latitude' => $data['creation_latitude'], 'creation_longitude' => $data['creation_longitude'], 'location_accuracy_meters' => isset($data['location_accuracy_meters']) ? (int) round($data['location_accuracy_meters']) : null, 'location_captured_at' => now(), 'created_by' => $request->user()->id]);
            $sale->update(['cashback_amount' => $data['cashback_amount'] ?? 0]);
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
        $trip = $this->operatingTrip($representative);
        abort_unless($sale->trip_id === $trip->id, 409);
        if ($request->input('payment_type') === PaymentType::Cash->value && ! $request->filled('payment_method')) {
            $request->merge(['payment_method' => $this->paymentMethods->defaultKey()]);
        }
        $data = $request->validate($this->rules(false));
        if ((isset($data['promotion_amount']) && (int) $data['promotion_amount'] !== $sale->promotion_amount)
            || (isset($data['promotion_title']) && (string) $data['promotion_title'] !== (string) $sale->promotion_title)) {
            throw ValidationException::withMessages(['promotion_amount' => ['Add promotions on individual items. Existing invoice promotions cannot be changed.']]);
        }
        $data['promotion_amount'] = $sale->promotion_amount;
        $data['promotion_title'] = $sale->promotion_title;
        [$customer, $items, $total] = $this->preparedDraft($representative, $data, $trip);
        DB::transaction(function () use ($request, $sale, $customer, $data, $items, $total): void {
            $sale = Sale::query()->lockForUpdate()->findOrFail($sale->id);
            if ($sale->status !== SaleStatus::Draft) {
                throw new DomainConflictException('Posted sales are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $old = $sale->load('items')->toArray();
            $sale->update(['warehouse_id' => $customer->assignedRegion->warehouse_id, 'region_id' => $customer->region_id, 'customer_id' => $customer->id, 'payment_type' => $data['payment_type'], 'payment_method' => $data['payment_type'] === PaymentType::Cash->value ? $data['payment_method'] : null, 'total_amount' => $total, 'promotion_title' => $data['promotion_title'] ?? null, 'promotion_amount' => $data['promotion_amount'] ?? 0, 'notes' => $data['notes'] ?? null]);
            $sale->update(['cashback_amount' => $data['cashback_amount'] ?? 0]);
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

    public function destroy(Request $request, Sale $sale): JsonResponse
    {
        $representative = $this->representative($request);
        $this->assertOwn($sale, $representative);

        DB::transaction(function () use ($request, $sale): void {
            $sale = Sale::query()->with('items')->lockForUpdate()->findOrFail($sale->id);
            if ($sale->status !== SaleStatus::Draft) {
                throw new DomainConflictException('Only draft sales can be deleted.', 'INVALID_DOCUMENT_STATE');
            }
            $metadata = ['reference' => $sale->reference, 'total_amount' => $sale->total_amount, 'items' => $sale->items->map->only(['product_id', 'quantity', 'foc_quantity'])->all()];
            $this->auditLogger->record($request, 'sale.draft_deleted', $request->user(), $sale, $metadata);
            $sale->delete();
        });

        return response()->json(status: 204);
    }

    /** @return array<string, mixed> */
    private function rules(bool $creating): array
    {
        return [
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'payment_type' => ['required', Rule::enum(PaymentType::class)],
            'payment_method' => ['nullable', 'required_if:payment_type,cash', Rule::in($this->paymentMethods->activeKeys())],
            'notes' => ['nullable', 'string', 'max:2000'],
            'cashback_amount' => ['nullable', 'integer', 'min:0', 'max:999999999999999'],
            'promotion_title' => ['nullable', 'string', 'max:150'],
            'promotion_amount' => ['nullable', 'integer', 'min:0', $creating ? 'max:0' : 'max:999999999999999'],
            'creation_latitude' => [$creating ? 'required' : 'prohibited', 'numeric', 'between:-90,90'],
            'creation_longitude' => [$creating ? 'required' : 'prohibited', 'numeric', 'between:-180,180'],
            'location_accuracy_meters' => [$creating ? 'nullable' : 'prohibited', 'numeric', 'min:0', 'max:1000000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'distinct', 'exists:products,id'],
            'items.*.product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
            'items.*.discount_percentage' => ['nullable', 'numeric', 'min:0', 'max:100', 'decimal:0,2'],
            'items.*.promotion_title' => ['nullable', 'string', 'max:150'],
            'items.*.promotion_amount' => ['nullable', 'integer', 'min:0', 'max:999999999999999'],
            'items.*.foc_product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'items.*.foc_quantity' => ['nullable', 'integer', 'min:0', 'max:4294967295'],
        ];
    }

    /** @param array<string, mixed> $data
     * @return array{Customer, list<array<string, int>>, int}
     */
    private function preparedDraft(SalesRepresentative $representative, array $data, Trip $trip): array
    {
        $customer = Customer::query()->with('assignedRegion')->whereKey($data['customer_id'])->where('is_active', true)
            ->where('region_id', $trip->region_id)->firstOrFail();
        $products = Product::query()->with(['units.regionPrices'])->whereIn('id', collect($data['items'])->pluck('product_id'))->where('is_active', true)->get()->keyBy('id');
        if ($products->count() !== count($data['items'])) {
            throw ValidationException::withMessages(['items' => ['Every sale product must be active and available for selection.']]);
        }
        $items = collect($data['items'])->map(function (array $item, int $index) use ($products, $customer): array {
            $product = $products->get($item['product_id']);
            $unit = $product->units->firstWhere('id', $item['product_unit_id'] ?? null) ?? $product->units->firstWhere('is_default_selling', true);
            $price = $unit?->regionPrices->firstWhere('region_id', $customer->region_id);
            if (! $unit?->is_active || ! $price) {
                throw ValidationException::withMessages(['items' => ['This product/unit has no active price for the customer region.']]);
            }
            $focQuantity = (int) ($item['foc_quantity'] ?? 0);
            $focUnit = $focQuantity ? ($product->units->firstWhere('id', $item['foc_product_unit_id'] ?? null) ?? $unit) : null;
            if ($focQuantity && ! $focUnit?->is_active) {
                throw ValidationException::withMessages(['items' => ['FOC must use an active unit of the same product.']]);
            }

            $gross = (int) $price->price * (int) $item['quantity'];
            $discountPercentage = (float) ($item['discount_percentage'] ?? 0);
            $discountAmount = (int) round($gross * $discountPercentage / 100);
            $promotion = (int) ($item['promotion_amount'] ?? 0);
            $promotionTitle = trim((string) ($item['promotion_title'] ?? ''));
            if ($discountAmount + $promotion > $gross) {
                throw ValidationException::withMessages(["items.{$index}.promotion_amount" => ['Discount and promotion cannot exceed this item total.']]);
            }

            return ['product_id' => (int) $item['product_id'], 'product_unit_id' => $unit->id, 'quantity' => (int) $item['quantity'], 'base_quantity' => (int) $item['quantity'] * $unit->conversion_factor, 'unit_price' => (int) $price->price, 'discount_percentage' => $discountPercentage, 'discount_amount' => $discountAmount, 'promotion_title' => $promotionTitle ?: null, 'promotion_amount' => $promotion, 'line_total' => $gross - $discountAmount - $promotion, 'foc_product_unit_id' => $focUnit?->id, 'foc_quantity' => $focQuantity, 'foc_base_quantity' => $focQuantity * ($focUnit?->conversion_factor ?? 0)];
        })->all();

        $subtotal = (int) collect($items)->sum('line_total');
        $cashbackAmount = (int) ($data['cashback_amount'] ?? 0);
        $promotionAmount = (int) ($data['promotion_amount'] ?? 0);
        if ($promotionAmount > 0 && empty(trim((string) ($data['promotion_title'] ?? '')))) {
            throw ValidationException::withMessages(['promotion_title' => ['Enter a title for the promotion cashback.']]);
        }
        if ($cashbackAmount + $promotionAmount > $subtotal) {
            throw ValidationException::withMessages(['cashback_amount' => ['Cashback and invoice promotion cannot exceed the discounted merchandise subtotal.']]);
        }

        return [$customer, $items, $subtotal - $cashbackAmount - $promotionAmount];
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

    private function operatingTrip(SalesRepresentative $representative): Trip
    {
        $trip = Trip::query()->with(['region', 'warehouse'])->where('sales_representative_id', $representative->id)->where('status', TripStatus::Operation)->latest('id')->first();
        if (! $trip) {
            throw new DomainConflictException('Start a trip operation before creating a sale.', 'NO_OPERATING_TRIP');
        }

        return $trip;
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['trip', 'representative.regions', 'warehouse', 'region', 'customer.assignedRegion', 'items.product', 'items.unit', 'items.focUnit', 'creator', 'poster', 'voider'];
    }

    private function load(Sale $sale): Sale
    {
        return $sale->fresh($this->relations());
    }
}
