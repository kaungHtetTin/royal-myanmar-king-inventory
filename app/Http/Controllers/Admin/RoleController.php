<?php

namespace App\Http\Controllers\Admin;

use App\Enums\RoleName;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function index(): JsonResponse
    {
        $roles = Role::query()
            ->with('permissions:id,name')
            ->orderBy('name')
            ->get();

        $userCounts = DB::table('model_has_roles')
            ->where('model_type', User::class)
            ->whereIn('role_id', $roles->pluck('id'))
            ->selectRaw('role_id, count(*) as aggregate')
            ->groupBy('role_id')
            ->pluck('aggregate', 'role_id');

        $roles = $roles->map(fn (Role $role) => $this->payload(
            $role,
            (int) ($userCounts[$role->id] ?? 0),
        ));

        return response()->json(['roles' => $roles]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate($this->rules());
        $role = DB::transaction(function () use ($request, $data): Role {
            $role = Role::query()->create(['name' => $data['name'], 'guard_name' => 'web']);
            $role->syncPermissions($data['permissions']);
            $this->auditLogger->record($request, 'role.created', $request->user(), $role, ['permissions' => $data['permissions']]);

            return $role;
        });

        return response()->json(['role' => $this->payload($role->load('permissions:id,name'))], 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        if ($role->name === RoleName::SuperAdmin->value) {
            throw ValidationException::withMessages(['role' => ['The Super Admin role is system-managed.']]);
        }

        $data = $request->validate($this->rules($role));
        $old = ['name' => $role->name, 'permissions' => $role->permissions()->pluck('name')->all()];

        DB::transaction(function () use ($request, $role, $data, $old): void {
            if (! in_array($role->name, [RoleName::OfficeAdmin->value, RoleName::SalesRepresentative->value], true)) {
                $role->update(['name' => $data['name']]);
            }
            $role->syncPermissions($data['permissions']);
            $this->auditLogger->record($request, 'role.updated', $request->user(), $role, [
                'old' => $old,
                'new' => ['name' => $role->name, 'permissions' => $data['permissions']],
            ]);
        });

        return response()->json(['role' => $this->payload($role->load('permissions:id,name'))]);
    }

    /** @return array<string, mixed> */
    private function rules(?Role $role = null): array
    {
        return [
            'name' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique('roles')->where('guard_name', 'web')->ignore($role)],
            'permissions' => ['required', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
        ];
    }

    /** @return array<string, mixed> */
    private function payload(Role $role, ?int $userCount = null): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'permissions' => $role->permissions->pluck('name')->values(),
            'users_count' => $userCount ?? DB::table('model_has_roles')
                ->where('model_type', User::class)
                ->where('role_id', $role->id)
                ->count(),
            'system' => in_array($role->name, array_column(RoleName::cases(), 'value'), true),
        ];
    }
}
