<?php

namespace App\Http\Controllers\Admin;

use App\Enums\RoleName;
use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class AccessOptionController extends Controller
{
    public function __invoke(Request $request, WarehouseAccess $warehouseAccess): JsonResponse
    {
        $user = $request->user();
        $roles = Role::query()
            ->when(! $user->isSuperAdmin(), fn ($query) => $query->where('name', '!=', RoleName::SuperAdmin->value))
            ->orderBy('name')
            ->get(['id', 'name']);
        $warehouses = $warehouseAccess->scope(Warehouse::query(), $user)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'code', 'name']);
        $permissions = $user->can('role.manage')
            ? Permission::query()->orderBy('name')->get(['id', 'name'])
            : collect();

        return response()->json(compact('roles', 'warehouses', 'permissions'));
    }
}
