<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

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

        $query = Product::query()
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

        return ProductResource::collection($query->paginate($data['per_page'] ?? 20)->withQueryString());
    }

    public function options(): JsonResponse
    {
        Gate::authorize('viewAny', Product::class);

        return response()->json([
            'categories' => Product::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category'),
            'units' => Product::query()->distinct()->orderBy('unit')->pluck('unit'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('create', Product::class);
        $request->merge($this->prepared($request));
        $data = $request->validate($this->rules());
        $product = Product::query()->create($this->normalized($data));
        $this->auditLogger->record($request, 'product.created', $request->user(), $product, ['new' => $product->toArray()]);

        return (new ProductResource($product))->response()->setStatusCode(201);
    }

    public function update(Request $request, Product $product): ProductResource
    {
        Gate::authorize('update', $product);
        $request->merge($this->prepared($request));
        $data = $request->validate($this->rules($product));
        $attributes = $this->normalized($data);
        $old = $product->only(array_keys($attributes));
        $product->update($attributes);
        $this->auditLogger->record($request, 'product.updated', $request->user(), $product, [
            'old' => $old,
            'new' => $product->only(array_keys($old)),
        ]);

        return new ProductResource($product);
    }

    /** @return array<string, mixed> */
    private function rules(?Product $product = null): array
    {
        return [
            'sku' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9_-]+$/', Rule::unique('products', 'sku')->ignore($product)],
            'name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:100'],
            'unit' => ['required', 'string', 'max:50'],
            'selling_price' => ['required', 'integer', 'min:0', 'max:999999999999999'],
            'barcode' => ['nullable', 'string', 'max:100', Rule::unique('products', 'barcode')->ignore($product)],
            'description' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['required', 'boolean'],
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
