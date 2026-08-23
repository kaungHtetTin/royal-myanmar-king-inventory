<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\RepresentativeInventory;
use App\Models\SalesRepresentative;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
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
        $stockByProduct = WarehouseInventory::query()
            ->whereIn('warehouse_id', $warehouseIds)
            ->get(['product_id', 'warehouse_id', 'quantity'])
            ->groupBy('product_id');
        $products = Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit'])
            ->map(function (Product $product) use ($stockByProduct): Product {
                $product->setAttribute('warehouse_stock', $stockByProduct->get($product->id, collect())->pluck('quantity', 'warehouse_id'));

                return $product;
            });

        return response()->json([
            'source_warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'representatives' => SalesRepresentative::query()->whereIn('primary_warehouse_id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name', 'primary_warehouse_id']),
            'products' => $products,
        ]);
    }

    public function representativeReturns(Request $request, WarehouseAccess $access): JsonResponse
    {
        $warehouseIds = $access->scope(Warehouse::query(), $request->user())->pluck('id');
        $representatives = SalesRepresentative::query()
            ->whereIn('primary_warehouse_id', $warehouseIds)
            ->where('is_active', true)
            ->orderBy('name')
            ->get(['id', 'code', 'name', 'primary_warehouse_id']);
        $stockByProduct = RepresentativeInventory::query()
            ->whereIn('sales_representative_id', $representatives->pluck('id'))
            ->get(['product_id', 'sales_representative_id', 'quantity'])
            ->groupBy('product_id');
        $products = Product::query()->where('is_active', true)->orderBy('name')->get(['id', 'sku', 'name', 'unit'])
            ->map(function (Product $product) use ($stockByProduct): Product {
                $product->setAttribute('representative_stock', $stockByProduct->get($product->id, collect())->pluck('quantity', 'sales_representative_id'));

                return $product;
            });

        return response()->json([
            'source_warehouses' => Warehouse::query()->whereIn('id', $warehouseIds)->where('is_active', true)->orderBy('name')->get(['id', 'code', 'name']),
            'representatives' => $representatives,
            'products' => $products,
        ]);
    }
}
