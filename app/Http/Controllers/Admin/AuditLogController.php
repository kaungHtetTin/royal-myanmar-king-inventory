<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\Product;
use App\Models\RepresentativeTransfer;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockAdjustment;
use App\Models\StockImport;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use App\Models\WarehouseTransfer;
use App\Services\ReportScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

class AuditLogController extends Controller
{
    public function __construct(private readonly ReportScope $scope) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'], 'actor_id' => ['nullable', 'integer', 'exists:users,id'], 'module' => ['nullable', 'string', 'max:50'], 'action' => ['nullable', 'string', 'max:100'], 'search' => ['nullable', 'string', 'max:100'], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date', 'after_or_equal:date_from'], 'page' => ['nullable', 'integer', 'min:1'], 'per_page' => ['nullable', 'integer', 'min:10', 'max:100']]);
        $warehouseIds = $this->scope->warehouseIds($request->user(), isset($data['warehouse_id']) ? (int) $data['warehouse_id'] : null);
        $query = AuditLog::query()->with('actor:id,name,username')->when($data['actor_id'] ?? null, fn ($query, $id) => $query->where('actor_id', $id))
            ->when($data['module'] ?? null, fn ($query, $module) => $query->where('event', 'like', "{$module}.%"))->when($data['action'] ?? null, fn ($query, $action) => $query->where('event', $action))
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where(fn ($scope) => $scope->where('event', 'like', "%{$search}%")->orWhere('subject_id', $search)->orWhereHas('actor', fn ($actor) => $actor->where('name', 'like', "%{$search}%")->orWhere('username', 'like', "%{$search}%"))))
            ->when($data['date_from'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '>=', $date))->when($data['date_to'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '<=', $date));
        if (! $request->user()->isSuperAdmin() || isset($data['warehouse_id'])) {
            $this->applyScope($query, $warehouseIds);
        }
        $filterQuery = clone $query;
        $actorIds = (clone $filterQuery)->whereNotNull('actor_id')->distinct()->pluck('actor_id');
        $paginator = $query->latest('id')->paginate($data['per_page'] ?? 25)->withQueryString();
        $rows = $paginator->getCollection()->map(function (AuditLog $log): array {
            [$module, $action] = array_pad(explode('.', $log->event, 2), 2, 'event');

            return ['id' => $log->id, 'event' => $log->event, 'module' => $module, 'action' => $action, 'actor' => $log->actor ? ['id' => $log->actor->id, 'name' => $log->actor->name, 'username' => $log->actor->username] : null, 'subject_type' => $log->subject_type ? class_basename($log->subject_type) : null, 'subject_id' => $log->subject_id, 'subject_url' => $this->subjectUrl($log->subject_type), 'old' => $log->metadata['old'] ?? null, 'new' => $log->metadata['new'] ?? null, 'metadata' => $log->metadata, 'ip_address' => $log->ip_address, 'created_at' => $log->created_at?->toISOString()];
        });
        $modules = AuditLog::query()->select('event')->distinct()->pluck('event')->map(fn (string $event) => Str::before($event, '.'))->unique()->sort()->values();

        return response()->json(['data' => $rows, 'meta' => ['current_page' => $paginator->currentPage(), 'from' => $paginator->firstItem(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'to' => $paginator->lastItem(), 'total' => $paginator->total()], 'filters' => ['warehouses' => Warehouse::query()->whereIn('id', $this->scope->warehouseIds($request->user()))->orderBy('name')->get(['id', 'code', 'name']), 'actors' => User::query()->whereIn('id', $actorIds)->orderBy('name')->get(['id', 'name', 'username']), 'modules' => $modules]]);
    }

    private function applyScope(Builder $query, $warehouseIds): void
    {
        $types = [Warehouse::class, Customer::class, SalesRepresentative::class, Vehicle::class, StockImport::class, StockAdjustment::class, WarehouseTransfer::class, RepresentativeTransfer::class, Sale::class, CashSubmission::class, CustomerPayment::class, User::class, Product::class, Role::class];
        $query->whereHasMorph('subject', $types, function (Builder $subject, string $type) use ($warehouseIds): void {
            match ($type) {
                Warehouse::class => $subject->whereIn('id', $warehouseIds),
                Customer::class, Sale::class, CashSubmission::class, CustomerPayment::class, StockImport::class, StockAdjustment::class => $subject->whereIn('warehouse_id', $warehouseIds),
                SalesRepresentative::class => $subject->whereIn('primary_warehouse_id', $warehouseIds),
                Vehicle::class => $subject->whereHas('representative', fn ($representative) => $representative->whereIn('primary_warehouse_id', $warehouseIds)),
                WarehouseTransfer::class => $subject->where(fn ($scope) => $scope->whereIn('source_warehouse_id', $warehouseIds)->orWhereIn('destination_warehouse_id', $warehouseIds)),
                RepresentativeTransfer::class => $subject->whereIn('source_warehouse_id', $warehouseIds),
                User::class => $subject->whereHas('warehouses', fn ($warehouse) => $warehouse->whereIn('warehouses.id', $warehouseIds)),
                Product::class, Role::class => null,
            };
        });
    }

    private function subjectUrl(?string $type): ?string
    {
        return match ($type) {
            Warehouse::class => '/admin/warehouses', Product::class => '/admin/products', Customer::class => '/admin/customers', SalesRepresentative::class => '/admin/representatives', Vehicle::class => '/admin/vehicles', StockImport::class, StockAdjustment::class => '/admin/inventory', WarehouseTransfer::class, RepresentativeTransfer::class => '/admin/transfers', Sale::class => '/admin/sales', CashSubmission::class, CustomerPayment::class => '/admin/cash', User::class, Role::class => '/admin/users', default => null,
        };
    }
}
