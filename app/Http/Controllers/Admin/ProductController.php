<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\ProductUnit;
use App\Models\Region;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProductController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Product::class);
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'category' => ['nullable', 'string', 'max:100'],
            'unit' => ['nullable', 'string', 'max:50'],
            'sort' => ['nullable', Rule::in(['sku', 'name', 'category', 'selling_price', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = Product::query()->with(['units.regionPrices'])
            ->when($data['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($builder) => $builder
                    ->where('sku', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%"));
            })
            ->when($data['status'] ?? null, fn ($query, string $status) => $query->where('is_active', $status === 'active'))
            ->when($data['category'] ?? null, fn ($query, string $category) => $query->where('category', $category))
            ->when($data['unit'] ?? null, fn ($query, string $unit) => $query->where('unit', $unit))
            ->orderBy($data['sort'] ?? 'name', $data['direction'] ?? 'asc');

        $summaryQuery = clone $query;
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'active' => (clone $summaryQuery)->where('is_active', true)->count(),
            'inactive' => (clone $summaryQuery)->where('is_active', false)->count(),
            'categories' => (clone $summaryQuery)->whereNotNull('category')->distinct()->count('category'),
        ];

        return ProductResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString())
            ->additional(['summary' => $summary]);
    }

    public function options(): JsonResponse
    {
        Gate::authorize('viewAny', Product::class);

        return response()->json([
            'categories' => Product::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
            'units' => Product::query()->distinct()->orderBy('unit')->pluck('unit'),
            'regions' => Region::query()->select('regions.*')->with('warehouse:id,code,name')
                ->join('warehouses', 'warehouses.id', '=', 'regions.warehouse_id')
                ->where('regions.is_active', true)
                ->orderBy('warehouses.name')->orderBy('warehouses.code')->orderBy('regions.name')->orderBy('regions.id')->get()
                ->map(fn (Region $region) => ['id' => $region->id, 'name' => $region->name, 'warehouse' => $region->warehouse->only(['id', 'code', 'name'])]),
        ]);
    }

    public function show(Product $product): ProductResource
    {
        Gate::authorize('view', $product);

        return new ProductResource($product->load('units.regionPrices'));
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Product::class);
        $request->merge($this->prepared($request));
        $this->prepareLegacyStructure($request);
        $data = $request->validate($this->rules());
        $this->assertUnitBarcodesAvailable($data['units']);
        $product = DB::transaction(function () use ($data): Product {
            $product = Product::query()->create($this->catalogueAttributes($data));
            $this->syncUnitsAndPrices($product, $data['units']);

            return $product;
        });
        $this->auditLogger->record($request, 'product.created', $request->user(), $product, ['new' => $product->toArray()]);

        return (new ProductResource($product->load('units.regionPrices')))->response()->setStatusCode(201);
    }

    public function update(Request $request, Product $product): ProductResource
    {
        Gate::authorize('update', $product);
        $request->merge($this->prepared($request));
        $this->prepareLegacyStructure($request, $product);
        $data = $request->validate($this->rules($product));
        $this->assertUnitBarcodesAvailable($data['units']);
        $attributes = $this->catalogueAttributes($data);
        $old = $product->only(array_keys($attributes));
        DB::transaction(function () use ($product, $attributes, $data): void {
            $product->update($attributes);
            $this->syncUnitsAndPrices($product, $data['units']);
        });
        $this->auditLogger->record($request, 'product.updated', $request->user(), $product, [
            'old' => $old,
            'new' => $product->only(array_keys($old)),
        ]);

        return new ProductResource($product->load('units.regionPrices'));
    }

    /** @return array<string, mixed> */
    private function rules(?Product $product = null): array
    {
        return [
            'sku' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9_-]+$/', Rule::unique('products', 'sku')->ignore($product)],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:100'],
            'unit' => ['nullable', 'string', 'max:50'],
            'selling_price' => ['nullable', 'integer', 'min:0', 'max:999999999999999'],
            'barcode' => ['nullable', 'string', 'max:100', Rule::unique('products', 'barcode')->ignore($product)],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['required', 'boolean'],
            'units' => ['required', 'array', 'min:1', 'max:20'],
            'units.*.id' => ['nullable', 'integer', 'exists:product_units,id'],
            'units.*.name' => ['required', 'string', 'max:50', 'distinct'],
            'units.*.conversion_factor' => ['required', 'integer', 'min:1', 'max:4294967295'],
            'units.*.barcode' => ['nullable', 'string', 'max:100', 'distinct'],
            'units.*.is_base' => ['required', 'boolean'],
            'units.*.is_default_selling' => ['required', 'boolean'],
            'units.*.is_active' => ['required', 'boolean'],
            'units.*.prices' => ['present', 'array'],
            'units.*.prices.*.region_id' => ['required', 'integer', 'exists:regions,id'],
            'units.*.prices.*.price' => ['required', 'integer', 'min:0', 'max:999999999999999'],
        ];
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function normalized(array $data): array
    {
        $data['sku'] = strtoupper(trim($data['sku']));
        foreach (['name', 'category', 'unit', 'barcode', 'description'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = trim((string) $data[$field]) ?: null;
            }
        }

        return $data;
    }

    /** @param array<string, mixed> $data */
    private function catalogueAttributes(array $data): array
    {
        $default = collect($data['units'])->firstWhere('is_default_selling', true);
        $firstPrice = collect($default['prices'] ?? [])->first()['price'] ?? ($data['selling_price'] ?? 0);

        return $this->normalized(collect($data)->only(['sku', 'name', 'category', 'description', 'is_active'])->all() + [
            'unit' => $default['name'],
            'selling_price' => $firstPrice,
            'barcode' => $default['barcode'] ?? null,
        ]);
    }

    /** @param list<array<string, mixed>> $units */
    private function syncUnitsAndPrices(Product $product, array $units): void
    {
        if (collect($units)->where('is_base', true)->count() !== 1 || collect($units)->where('is_default_selling', true)->count() !== 1) {
            throw ValidationException::withMessages(['units' => ['Define exactly one base unit and one default selling unit.']]);
        }
        if ((int) collect($units)->firstWhere('is_base', true)['conversion_factor'] !== 1) {
            throw ValidationException::withMessages(['units' => ['The base unit conversion factor must be 1.']]);
        }

        $requiredRegions = Region::query()->where('is_active', true)->pluck('id')->map(fn ($id) => (int) $id)->sort()->values();
        $kept = [];
        foreach ($units as $index => $input) {
            $priceRegions = collect($input['prices'])->pluck('region_id')->map(fn ($id) => (int) $id)->sort()->values();
            if ($input['is_active'] && $priceRegions->all() !== $requiredRegions->all()) {
                throw ValidationException::withMessages(["units.$index.prices" => ['Every active unit requires a price for every active region.']]);
            }
            $unit = isset($input['id'])
                ? ProductUnit::query()->where('product_id', $product->id)->findOrFail($input['id'])
                : (ProductUnit::query()->where('product_id', $product->id)->where('name', $input['name'])->first() ?? new ProductUnit(['product_id' => $product->id]));
            $unit->fill(collect($input)->only(['name', 'conversion_factor', 'barcode', 'is_base', 'is_default_selling', 'is_active'])->all());
            $unit->product_id = $product->id;
            $unit->save();
            $kept[] = $unit->id;
            foreach ($input['prices'] as $price) {
                $unit->regionPrices()->updateOrCreate(['region_id' => $price['region_id']], ['price' => $price['price']]);
            }
            $unit->regionPrices()->whereNotIn('region_id', $priceRegions)->delete();
        }
        ProductUnit::query()->where('product_id', $product->id)->whereNotIn('id', $kept)->update(['is_active' => false, 'is_base' => false, 'is_default_selling' => false]);
    }

    /** @param list<array<string, mixed>> $units */
    private function assertUnitBarcodesAvailable(array $units): void
    {
        $barcodes = collect($units)->pluck('barcode')->filter()->values();
        if ($barcodes->isEmpty()) {
            return;
        }

        $keptIds = collect($units)->pluck('id')->filter()->values();
        $conflict = ProductUnit::query()->whereIn('barcode', $barcodes)
            ->when($keptIds->isNotEmpty(), fn ($query) => $query->whereNotIn('id', $keptIds))
            ->value('barcode');
        if ($conflict) {
            throw ValidationException::withMessages(['units' => ["Unit barcode {$conflict} is already in use."]]);
        }
    }

    private function prepareLegacyStructure(Request $request, ?Product $product = null): void
    {
        if ($request->has('units')) {
            return;
        }
        $existing = $product?->load('units.regionPrices')->units->firstWhere('is_default_selling', true);
        $prices = Region::query()->where('is_active', true)->pluck('id')->map(fn ($regionId) => [
            'region_id' => (int) $regionId,
            'price' => (int) ($existing?->regionPrices->firstWhere('region_id', $regionId)?->price ?? $request->input('selling_price', 0)),
        ])->values()->all();
        $request->merge(['units' => [[
            'id' => $existing?->id,
            'name' => $request->input('unit', $existing?->name ?? 'piece'),
            'conversion_factor' => 1,
            'barcode' => $request->input('barcode'),
            'is_base' => true,
            'is_default_selling' => true,
            'is_active' => true,
            'prices' => $prices,
        ]]]);
    }

    /** @return array<string, mixed> */
    private function prepared(Request $request): array
    {
        $prepared = ['sku' => strtoupper(trim($request->string('sku')->toString()))];
        foreach (['name', 'category', 'unit', 'barcode', 'description'] as $field) {
            if ($request->exists($field)) {
                $prepared[$field] = trim($request->string($field)->toString()) ?: null;
            }
        }

        return $prepared;
    }
}
