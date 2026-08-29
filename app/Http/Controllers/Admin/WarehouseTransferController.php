<?php

namespace App\Http\Controllers\Admin;

use App\Enums\TransferStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\WarehouseTransferResource;
use App\Models\ProductUnit;
use App\Models\Warehouse;
use App\Models\WarehouseTransfer;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\WarehouseAccess;
use App\Services\WarehouseTransferPostingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WarehouseTransferController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly WarehouseTransferPostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'status' => ['nullable', Rule::enum(TransferStatus::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseIds($request);
        if (isset($data['warehouse_id']) && ! $warehouseIds->contains((int) $data['warehouse_id'])) {
            abort(403);
        }
        $query = WarehouseTransfer::query()->with($this->relations())->withSum('items as total_quantity', 'base_quantity')
            ->where(fn ($scope) => $scope->whereIn('source_warehouse_id', $warehouseIds)->orWhereIn('destination_warehouse_id', $warehouseIds))
            ->when($data['warehouse_id'] ?? null, fn ($query, $id) => $query->where(fn ($scope) => $scope->where('source_warehouse_id', $id)->orWhere('destination_warehouse_id', $id)))
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '>=', $date))
            ->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '<=', $date))
            ->latest('id');

        $matching = (clone $query)->get();
        $summary = ['total' => $matching->count(), 'units' => (int) $matching->sum('total_quantity'), 'products' => $matching->flatMap->items->pluck('product_id')->unique()->count(), 'in_transit' => $matching->where('status', TransferStatus::Dispatched)->count()];

        return WarehouseTransferResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())->additional(['summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->assertWarehouse($request, (int) $data['source_warehouse_id']);
        $transfer = DB::transaction(function () use ($request, $data): WarehouseTransfer {
            $items = $this->prepareItems($data['items']);
            $transfer = WarehouseTransfer::query()->create([
                'reference' => $this->references->next('warehouse_transfer', 'WTR'),
                'source_warehouse_id' => $data['source_warehouse_id'],
                'destination_warehouse_id' => $data['destination_warehouse_id'],
                'status' => TransferStatus::Draft,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);
            $transfer->items()->createMany($items);
            $this->auditLogger->record($request, 'warehouse_transfer.created', $request->user(), $transfer, ['new' => $data]);

            return $transfer;
        });

        return (new WarehouseTransferResource($this->load($transfer)))->response()->setStatusCode(201);
    }

    public function show(Request $request, WarehouseTransfer $warehouseTransfer): WarehouseTransferResource
    {
        $this->assertWarehouse($request, $warehouseTransfer->source_warehouse_id);

        return new WarehouseTransferResource($this->load($warehouseTransfer));
    }

    public function update(Request $request, WarehouseTransfer $warehouseTransfer): WarehouseTransferResource
    {
        $this->assertWarehouse($request, $warehouseTransfer->source_warehouse_id);
        $data = $request->validate($this->rules());
        $this->assertWarehouse($request, (int) $data['source_warehouse_id']);
        DB::transaction(function () use ($request, $warehouseTransfer, $data): void {
            $items = $this->prepareItems($data['items']);
            $warehouseTransfer = WarehouseTransfer::query()->lockForUpdate()->findOrFail($warehouseTransfer->id);
            $this->requireDraft($warehouseTransfer);
            $old = $warehouseTransfer->load('items')->toArray();
            $warehouseTransfer->update(['source_warehouse_id' => $data['source_warehouse_id'], 'destination_warehouse_id' => $data['destination_warehouse_id'], 'notes' => $data['notes'] ?? null]);
            $warehouseTransfer->items()->delete();
            $warehouseTransfer->items()->createMany($items);
            $this->auditLogger->record($request, 'warehouse_transfer.updated', $request->user(), $warehouseTransfer, ['old' => $old, 'new' => $data]);
        });

        return new WarehouseTransferResource($this->load($warehouseTransfer));
    }

    public function dispatch(Request $request, WarehouseTransfer $warehouseTransfer): WarehouseTransferResource
    {
        $this->assertWarehouse($request, $warehouseTransfer->source_warehouse_id);
        $this->posting->dispatch($warehouseTransfer, $request->user(), $this->idempotencyKey($request), $request);

        return new WarehouseTransferResource($this->load($warehouseTransfer));
    }

    public function receive(Request $request, WarehouseTransfer $warehouseTransfer): WarehouseTransferResource
    {
        $this->assertWarehouse($request, $warehouseTransfer->destination_warehouse_id);
        $this->posting->receive($warehouseTransfer, $request->user(), $this->idempotencyKey($request), $request);

        return new WarehouseTransferResource($this->load($warehouseTransfer));
    }

    public function cancel(Request $request, WarehouseTransfer $warehouseTransfer): WarehouseTransferResource
    {
        $this->assertWarehouse($request, $warehouseTransfer->source_warehouse_id);
        $this->posting->cancel($warehouseTransfer, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new WarehouseTransferResource($this->load($warehouseTransfer));
    }

    public function reverse(Request $request, WarehouseTransfer $warehouseTransfer): WarehouseTransferResource
    {
        $this->assertWarehouse($request, $warehouseTransfer->source_warehouse_id);
        if ($warehouseTransfer->status === TransferStatus::Received) {
            $this->assertWarehouse($request, $warehouseTransfer->destination_warehouse_id);
        }
        $this->posting->reverse($warehouseTransfer, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new WarehouseTransferResource($this->load($warehouseTransfer));
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'source_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'destination_warehouse_id' => ['required', 'integer', 'different:source_warehouse_id', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'distinct', Rule::exists('products', 'id')->where('is_active', true)],
            'items.*.product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:4294967295'],
        ];
    }

    /** @param array<int, array<string, mixed>> $items
     * @return array<int, array<string, mixed>>
     */
    private function prepareItems(array $items): array
    {
        foreach ($items as $index => &$item) {
            $unit = isset($item['product_unit_id'])
                ? ProductUnit::query()
                    ->where('product_id', $item['product_id'])
                    ->where('is_active', true)
                    ->lockForUpdate()
                    ->find($item['product_unit_id'])
                : ProductUnit::query()
                    ->where('product_id', $item['product_id'])
                    ->where('is_active', true)
                    ->where('is_base', true)
                    ->lockForUpdate()
                    ->first();

            if (! $unit) {
                throw ValidationException::withMessages([
                    "items.{$index}.product_unit_id" => ['Select an active unit that belongs to this product.'],
                ]);
            }

            $quantity = (int) $item['quantity'];
            if ($quantity > intdiv(PHP_INT_MAX, $unit->conversion_factor)) {
                throw ValidationException::withMessages([
                    "items.{$index}.quantity" => ['The converted base quantity is too large.'],
                ]);
            }

            $item['product_unit_id'] = $unit->id;
            $item['base_quantity'] = $quantity * $unit->conversion_factor;
        }
        unset($item);

        return $items;
    }

    private function requireDraft(WarehouseTransfer $transfer): void
    {
        if ($transfer->status !== TransferStatus::Draft) {
            throw new DomainConflictException('Dispatched transfer lines are immutable.', 'INVALID_DOCUMENT_STATE');
        }
    }

    private function assertWarehouse(Request $request, int $warehouseId): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $warehouseId), 403);
    }

    private function warehouseIds(Request $request)
    {
        return $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
    }

    /** @return list<string> */
    private function relations(): array
    {
        return ['sourceWarehouse', 'destinationWarehouse', 'items.product', 'items.productUnit', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser'];
    }

    private function load(WarehouseTransfer $transfer): WarehouseTransfer
    {
        return $transfer->fresh($this->relations());
    }
}
