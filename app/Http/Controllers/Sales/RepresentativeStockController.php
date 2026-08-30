<?php

namespace App\Http\Controllers\Sales;

use App\Enums\TransferStatus;
use App\Http\Controllers\Admin\RepresentativeInventoryController;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\RepresentativeInventoryResource;
use App\Http\Resources\RepresentativeTransferResource;
use App\Models\InTransitInventory;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Services\RepresentativeTransferPostingService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class RepresentativeStockController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(private readonly RepresentativeTransferPostingService $posting) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);
        $data = $request->validate([
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);
        $query = RepresentativeInventoryController::withPending(RepresentativeInventory::query())
            ->with(['representative', 'product'])
            ->where('sales_representative_id', $representative->id)
            ->when($data['search'] ?? null, function ($query, string $search): void {
                $query->whereHas('product', function ($productQuery) use ($search): void {
                    $productQuery->where(function ($match) use ($search): void {
                        $match->where('name', 'like', "%{$search}%")
                            ->orWhere('sku', 'like', "%{$search}%");
                    });
                });
            })
            ->orderBy('product_id');

        $summary = [
            'on_hand' => (int) RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->sum('quantity'),
            'foc_on_hand' => (int) RepresentativeInventory::query()->where('sales_representative_id', $representative->id)->sum('foc_quantity'),
            'incoming' => (int) InTransitInventory::query()->where('transfer_type', 'representative_transfer')
                ->whereIn('transfer_id', RepresentativeTransfer::query()->select('id')->where('sales_representative_id', $representative->id)->where('status', TransferStatus::Dispatched))
                ->sum('quantity'),
        ];

        return RepresentativeInventoryResource::collection($query->paginate($data['per_page'] ?? 10)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function pending(Request $request): AnonymousResourceCollection
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);
        $data = $request->validate(['per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $query = RepresentativeTransfer::query()
            ->with(['trip', 'sourceWarehouse', 'representative', 'items.product', 'items.unit', 'items.focUnit', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser'])
            ->withSum('items as total_quantity', 'quantity')
            ->where('sales_representative_id', $representative->id)
            ->where('direction', 'issue')
            ->where('status', TransferStatus::Dispatched)
            ->oldest('dispatched_at');

        return RepresentativeTransferResource::collection($query->paginate($data['per_page'] ?? 10)->withQueryString());
    }

    public function history(Request $request): AnonymousResourceCollection
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);
        $data = $request->validate(['per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $query = RepresentativeTransfer::query()
            ->with(['trip', 'sourceWarehouse', 'representative', 'items.product', 'items.unit', 'items.focUnit', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser'])
            ->withSum('items as total_quantity', 'quantity')
            ->where('sales_representative_id', $representative->id)
            ->where('direction', 'issue')
            ->whereIn('status', [TransferStatus::Received, TransferStatus::Reversed])
            ->latest('updated_at');

        return RepresentativeTransferResource::collection($query->paginate($data['per_page'] ?? 10)->withQueryString());
    }

    public function receive(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active && $representativeTransfer->sales_representative_id === $representative->id, 403);
        $this->posting->receive($representativeTransfer, $request->user(), $this->idempotencyKey($request), $request);

        return new RepresentativeTransferResource($representativeTransfer->fresh(['trip', 'sourceWarehouse', 'representative', 'items.product', 'items.unit', 'items.focUnit', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser']));
    }

    public function show(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $this->assertOwner($request, $representativeTransfer);
        abort_unless($representativeTransfer->direction === 'issue', 404);

        return new RepresentativeTransferResource($this->load($representativeTransfer));
    }

    private function assertOwner(Request $request, RepresentativeTransfer $transfer): void
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active && $transfer->sales_representative_id === $representative->id, 403);
    }

    private function load(RepresentativeTransfer $transfer): RepresentativeTransfer
    {
        return $transfer->fresh(['trip', 'sourceWarehouse', 'representative', 'items.product', 'items.unit', 'items.focUnit', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser']);
    }
}
