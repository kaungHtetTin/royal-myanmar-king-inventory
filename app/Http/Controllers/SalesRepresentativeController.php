<?php

namespace App\Http\Controllers;

use App\Models\SalesRepresentative;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class SalesRepresentativeController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function current(Request $request): JsonResponse
    {
        $representative = $request->user()->salesRepresentative()->with(['primaryWarehouse:id,code,name', 'regions.ways'])->firstOrFail();
        Gate::authorize('view', $representative);

        return response()->json(['representative' => $this->payload($representative)]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $request->user();
        $representative = $user->salesRepresentative()->firstOrFail();
        Gate::authorize('view', $representative);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users')->ignore($user)],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users')->ignore($user)],
            'phone' => ['nullable', 'string', 'max:50'],
        ]);
        $old = [
            'user' => $user->only(['name', 'username', 'email']),
            'representative' => $representative->only(['name', 'email', 'phone', 'region']),
        ];

        DB::transaction(function () use ($data, $representative, $user): void {
            $user->update([
                'name' => $data['name'],
                'username' => $data['username'],
                'email' => $data['email'] ?? null,
            ]);
            $representative->update([
                'name' => $data['name'],
                'email' => $data['email'] ?? null,
                'phone' => $data['phone'] ?? null,
            ]);
        });
        $this->auditLogger->record($request, 'sales.profile_updated', $user, $representative, [
            'old' => $old,
            'new' => [
                'user' => $user->only(['name', 'username', 'email']),
                'representative' => $representative->only(['name', 'email', 'phone']),
            ],
        ]);

        return response()->json([
            'representative' => $this->payload($representative->fresh(['primaryWarehouse:id,code,name', 'regions.ways'])),
            'user' => $user->only(['id', 'name', 'username', 'email']),
        ]);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        $representative = $user->salesRepresentative()->firstOrFail();
        Gate::authorize('view', $representative);
        $data = $request->validate([
            'current_password' => ['required', 'string', 'min:6'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);
        if (! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => ['The current password is incorrect.']]);
        }
        $user->update(['password' => $data['password']]);
        $this->auditLogger->record($request, 'sales.password_updated', $user, $representative);

        return response()->json(['message' => 'Password updated.']);
    }

    public function show(SalesRepresentative $salesRepresentative): JsonResponse
    {
        Gate::authorize('view', $salesRepresentative);
        $salesRepresentative->loadMissing(['primaryWarehouse:id,code,name', 'regions.ways']);

        return response()->json(['representative' => $this->payload($salesRepresentative)]);
    }

    /** @return array<string, mixed> */
    private function payload(SalesRepresentative $representative): array
    {
        $representative->loadMissing('user:id,name,username,email');

        return [
            'id' => $representative->id,
            'code' => $representative->code,
            'name' => $representative->name,
            'phone' => $representative->phone,
            'email' => $representative->email,
            'region' => $representative->region,
            'regions' => $representative->regions->map(fn ($region) => [
                'id' => $region->id, 'name' => $region->name,
                'ways' => $region->ways->map->only(['id', 'code', 'name'])->values(),
            ])->values(),
            'is_active' => $representative->is_active,
            'primary_warehouse' => $representative->primaryWarehouse,
            'account' => [
                'id' => $representative->user->id,
                'name' => $representative->user->name,
                'username' => $representative->user->username,
                'email' => $representative->user->email,
            ],
        ];
    }
}
