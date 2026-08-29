<?php

namespace App\Http\Controllers\Admin;

use App\Enums\TransferStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\RepresentativeTransferResource;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Services\AuditLogger;
use App\Services\DocumentReferenceGenerator;
use App\Services\RepresentativeTransferPostingService;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class RepresentativeReturnController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly WarehouseAccess $warehouseAccess,
        private readonly DocumentReferenceGenerator $references,
        private readonly RepresentativeTransferPostingService $posting,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $data = $request->validate([
            'status' => ['nullable', Rule::enum(TransferStatus::class)],
            'search' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);
        $warehouseIds = $this->warehouseIds($request);
        $query = RepresentativeTransfer::query()->with($this->relations())->withSum('items as total_quantity', 'quantity')
            ->where('direction', 'return')
            ->whereIn('source_warehouse_id', $warehouseIds)
            ->where('status', '!=', TransferStatus::Cancelled)
            ->when($data['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('reference', 'like', "%{$search}%"))
            ->latest('id');
        $matching = (clone $query)->get();
        $summary = [
            'total' => $matching->count(),
            'units' => (int) $matching->sum('total_quantity'),
            'products' => $matching->flatMap->items->pluck('product_id')->unique()->count(),
            'in_transit' => 0,
        ];

        return RepresentativeTransferResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $this->assertScope($request, (int) $data['target_warehouse_id'], (int) $data['sales_representative_id']);
        $transfer = DB::transaction(function () use ($request, $data): RepresentativeTransfer {
            $transfer = RepresentativeTransfer::query()->create([
                'reference' => $this->references->next('representative_return', 'RRT'),
                'direction' => 'return',
                'source_warehouse_id' => $data['target_warehouse_id'],
                'sales_representative_id' => $data['sales_representative_id'],
                'status' => TransferStatus::Draft,
                'notes' => $data['notes'] ?? null,
                'created_by' => $request->user()->id,
            ]);
            $transfer->items()->createMany($this->preparedItems($data['items']));
            $this->auditLogger->record($request, 'representative_return.created', $request->user(), $transfer, ['new' => $data]);

            return $transfer;
        });

        return (new RepresentativeTransferResource($this->load($transfer)))->response()->setStatusCode(201);
    }

    public function show(Request $request, RepresentativeTransfer $representativeReturn): RepresentativeTransferResource
    {
        $this->assertReturn($representativeReturn);
        $this->assertScope($request, $representativeReturn->source_warehouse_id, $representativeReturn->sales_representative_id);

        return new RepresentativeTransferResource($this->load($representativeReturn));
    }

    public function update(Request $request, RepresentativeTransfer $representativeReturn): RepresentativeTransferResource
    {
        $this->assertReturn($representativeReturn);
        $this->assertScope($request, $representativeReturn->source_warehouse_id, $representativeReturn->sales_representative_id);
        $data = $request->validate($this->rules());
        $this->assertScope($request, (int) $data['target_warehouse_id'], (int) $data['sales_representative_id']);
        DB::transaction(function () use ($request, $representativeReturn, $data): void {
            $representativeReturn = RepresentativeTransfer::query()->lockForUpdate()->findOrFail($representativeReturn->id);
            if ($representativeReturn->status !== TransferStatus::Draft) {
                throw new DomainConflictException('Posted representative return lines are immutable.', 'INVALID_DOCUMENT_STATE');
            }
            $representativeReturn->update([
                'source_warehouse_id' => $data['target_warehouse_id'],
                'sales_representative_id' => $data['sales_representative_id'],
                'notes' => $data['notes'] ?? null,
            ]);
            $representativeReturn->items()->delete();
            $representativeReturn->items()->createMany($this->preparedItems($data['items']));
            $this->auditLogger->record($request, 'representative_return.updated', $request->user(), $representativeReturn, ['new' => $data]);
        });

        return new RepresentativeTransferResource($this->load($representativeReturn));
    }

    public function post(Request $request, RepresentativeTransfer $representativeReturn): RepresentativeTransferResource
    {
        $this->assertReturn($representativeReturn);
        $this->assertScope($request, $representativeReturn->source_warehouse_id, $representativeReturn->sales_representative_id);
        $this->posting->postReturn($representativeReturn, $request->user(), $this->idempotencyKey($request), $request);

        return new RepresentativeTransferResource($this->load($representativeReturn));
    }

    public function cancel(Request $request, RepresentativeTransfer $representativeReturn): RepresentativeTransferResource
    {
        $this->assertReturn($representativeReturn);
        $this->assertScope($request, $representativeReturn->source_warehouse_id, $representativeReturn->sales_representative_id);
        $this->posting->cancel($representativeReturn, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new RepresentativeTransferResource($this->load($representativeReturn));
    }

    public function reverse(Request $request, RepresentativeTransfer $representativeReturn): RepresentativeTransferResource
    {
        $this->assertReturn($representativeReturn);
        $this->assertScope($request, $representativeReturn->source_warehouse_id, $representativeReturn->sales_representative_id);
        $this->posting->reverse($representativeReturn, $request->user(), $this->idempotencyKey($request), $this->commandReason($request), $request);

        return new RepresentativeTransferResource($this->load($representativeReturn));
    }

    private function rules(): array
    {
        return [
            'target_warehouse_id' => ['required', 'integer', Rule::exists('warehouses', 'id')->where('is_active', true)],
            'sales_representative_id' => ['required', 'integer', Rule::exists('sales_representatives', 'id')->where('is_active', true)],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_id' => ['required', 'integer', 'distinct', Rule::exists('products', 'id')->where('is_active', true)],
            'items.*.quantity' => ['required', 'integer', 'min:0', 'max:4294967295'],
            'items.*.product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
            'items.*.foc_quantity' => ['nullable', 'integer', 'min:0', 'max:4294967295'],
            'items.*.foc_product_unit_id' => ['nullable', 'integer', 'exists:product_units,id'],
        ];
    }

    private function assertReturn(RepresentativeTransfer $transfer): void
    {
        abort_unless($transfer->direction === 'return', 404);
    }

    private function assertScope(Request $request, int $warehouseId, int $representativeId): void
    {
        abort_unless($this->warehouseAccess->allows($request->user(), $warehouseId), 403);
        $representative = SalesRepresentative::query()->findOrFail($representativeId);
        abort_unless($this->warehouseAccess->allows($request->user(), $representative->primary_warehouse_id), 403);
    }

    private function warehouseIds(Request $request)
    {
        return $this->warehouseAccess->scope(Warehouse::query(), $request->user())->pluck('id');
    }

    private function relations(): array
    {
        return ['sourceWarehouse', 'representative', 'items.product', 'items.unit', 'items.focUnit', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser'];
    }

    private function load(RepresentativeTransfer $transfer): RepresentativeTransfer
    {
        return $transfer->fresh($this->relations());
    }

    private function preparedItems(array $items): array
    {
        return collect($items)->map(function (array $item, int $index): array {
            $product = Product::query()->with('defaultSellingUnit')->findOrFail($item['product_id']);
            $unit = ProductUnit::query()->where('product_id', $product->id)->where('is_active', true)->find($item['product_unit_id'] ?? $product->defaultSellingUnit?->id);
            $paidQuantity = (int) $item['quantity'];
            $focQuantity = (int) ($item['foc_quantity'] ?? 0);
            $focUnit = $focQuantity > 0 ? ProductUnit::query()->where('product_id', $product->id)->where('is_active', true)->find($item['foc_product_unit_id'] ?? $unit?->id) : null;
            if (! $unit || ($focQuantity > 0 && ! $focUnit)) {
                throw ValidationException::withMessages(['items' => ['Select valid active units of the same product.']]);
            }
            if (($paidQuantity * $unit->conversion_factor) + ($focQuantity * ($focUnit?->conversion_factor ?? 0)) < 1) {
                throw ValidationException::withMessages(["items.{$index}.quantity" => ['Return at least one paid or FOC base unit.']]);
            }

            return ['product_id' => $product->id, 'product_unit_id' => $unit->id, 'quantity' => $paidQuantity, 'base_quantity' => $paidQuantity * $unit->conversion_factor, 'foc_product_unit_id' => $focUnit?->id, 'foc_quantity' => $focQuantity, 'foc_base_quantity' => $focQuantity * ($focUnit?->conversion_factor ?? 0)];
        })->all();
    }
}
