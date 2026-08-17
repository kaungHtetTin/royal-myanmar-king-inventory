<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\UserAccessManager;
use App\Services\UserAdministrationAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class UserController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly UserAccessManager $accessManager,
        private readonly UserAdministrationAccess $administrationAccess,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'role' => ['nullable', 'string', 'max:100'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = $this->administrationAccess->scope(User::query(), $request->user())
            ->with(['roles:id,name', 'warehouses:id,code,name'])
            ->when($validated['search'] ?? null, function ($query, string $search): void {
                $query->where(fn ($builder) => $builder
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%"));
            })
            ->when($validated['status'] ?? null, fn ($query, string $status) => $query->where('is_active', $status === 'active'))
            ->when($validated['role'] ?? null, fn ($query, string $role) => $query->role($role))
            ->orderBy('name');

        return UserResource::collection($query->paginate($validated['per_page'] ?? 20)->withQueryString());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $actor = $request->user();
        $user = DB::transaction(function () use ($request, $actor, $data): User {
            $user = User::query()->create([
                'name' => $data['name'],
                'username' => strtolower($data['username']),
                'email' => strtolower($data['email']),
                'password' => $data['password'],
                'is_active' => $data['is_active'] ?? true,
                'deactivated_at' => ($data['is_active'] ?? true) ? null : now(),
            ]);

            $this->accessManager->sync($request, $actor, $user, $data['roles'], $data['warehouse_ids']);
            $this->auditLogger->record($request, 'user.created', $actor, $user);

            return $user;
        });

        return (new UserResource($user->load(['roles:id,name', 'warehouses:id,code,name'])))
            ->response()->setStatusCode(201);
    }

    public function update(Request $request, User $user): UserResource
    {
        Gate::authorize('update', $user);
        $data = $request->validate($this->rules($user));
        if ($request->user()->is($user) && array_key_exists('is_active', $data) && ! $data['is_active']) {
            throw ValidationException::withMessages(['is_active' => ['You cannot deactivate your own account.']]);
        }

        $old = $user->only(['name', 'username', 'email', 'is_active']);
        $user->fill([
            'name' => $data['name'],
            'username' => strtolower($data['username']),
            'email' => strtolower($data['email']),
            'is_active' => $data['is_active'],
            'deactivated_at' => $data['is_active'] ? null : ($user->deactivated_at ?? now()),
        ]);
        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }
        $user->save();
        $this->auditLogger->record($request, 'user.updated', $request->user(), $user, ['old' => $old, 'new' => $user->only(array_keys($old))]);

        return new UserResource($user->load(['roles:id,name', 'warehouses:id,code,name']));
    }

    public function updateAccess(Request $request, User $user): UserResource
    {
        Gate::authorize('update', $user);
        $data = $request->validate([
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['string', 'distinct', 'max:100'],
            'warehouse_ids' => ['present', 'array'],
            'warehouse_ids.*' => ['integer', 'distinct', 'exists:warehouses,id'],
        ]);
        $this->accessManager->sync($request, $request->user(), $user, $data['roles'], $data['warehouse_ids']);

        return new UserResource($user->load(['roles:id,name', 'warehouses:id,code,name']));
    }

    /** @return array<string, mixed> */
    private function rules(?User $user = null): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users')->ignore($user)],
            'email' => ['required', 'email', 'max:255', Rule::unique('users')->ignore($user)],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:12', 'confirmed'],
            'is_active' => ['required', 'boolean'],
            'roles' => [$user ? 'sometimes' : 'required', 'array', 'min:1'],
            'roles.*' => ['string', 'distinct', 'max:100'],
            'warehouse_ids' => [$user ? 'sometimes' : 'present', 'array'],
            'warehouse_ids.*' => ['integer', 'distinct', 'exists:warehouses,id'],
        ];
    }
}
