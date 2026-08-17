<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Services\WarehouseAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransferOptionController extends Controller
{
    public function warehouses(Request $request, WarehouseAccess $access): JsonResponse
    {
        return response()->json([
            'source_warehouses' => $access->scope(Warehouse::query(), $request->user())->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'destination_warehouses' => Warehouse::query()->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'products' => Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit']),
        ]);
    }

    public function representatives(Request $request, WarehouseAccess $access): JsonResponse
    {
        $warehouseIds = $access->scope(Warehouse::query(), $request->user())->pluck('id');

        return response()->json([
            'source_warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'representatives' => SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'primary_warehouse_id']),
            'products' => Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit']),
        ]);
    }
}
