<?php

namespace App\Http\Controllers\Sales;

use App\Enums\TransferStatus;
use App\Http\Controllers\Admin\RepresentativeInventoryController;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\RepresentativeInventoryResource;
use App\Http\Resources\RepresentativeTransferResource;
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
        $query = RepresentativeInventoryController::withPending(RepresentativeInventory::query())
            ->with(['representative', 'product'])
            ->where('sales_representative_id', $representative->id)
            ->orderBy('product_id');

        return RepresentativeInventoryResource::collection($query->paginate(50));
    }

    public function pending(Request $request): AnonymousResourceCollection
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);
        $query = RepresentativeTransfer::query()
            ->with(['sourceWarehouse', 'representative', 'items.product', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser'])
            ->withSum('items as total_quantity', 'quantity')
            ->where('sales_representative_id', $representative->id)
            ->where('status', TransferStatus::Dispatched)
            ->oldest('dispatched_at');

        return RepresentativeTransferResource::collection($query->paginate(20));
    }

    public function receive(Request $request, RepresentativeTransfer $representativeTransfer): RepresentativeTransferResource
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active && $representativeTransfer->sales_representative_id === $representative->id, 403);
        $this->posting->receive($representativeTransfer, $request->user(), $this->idempotencyKey($request), $request);

        return new RepresentativeTransferResource($representativeTransfer->fresh(['sourceWarehouse', 'representative', 'items.product', 'transit', 'creator', 'dispatcher', 'receiver', 'canceller', 'reverser']));
    }
}
