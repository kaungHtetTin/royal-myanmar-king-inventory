<?php

namespace App\Http\Controllers\Auth;

use App\Enums\RoleName;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SessionController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function store(LoginRequest $request): JsonResponse
    {
        $key = $this->throttleKey($request);

        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages([
                'login' => ['Too many login attempts. Try again in '.RateLimiter::availableIn($key).' seconds.'],
            ]);
        }

        $login = Str::lower($request->string('login')->toString());
        $field = filter_var($login, FILTER_VALIDATE_EMAIL) ? 'email' : 'username';
        $user = User::query()->where($field, $login)->first();

        if (! $user || ! Hash::check($request->string('password')->toString(), $user->password)) {
            RateLimiter::hit($key, 60);
            $this->auditLogger->record($request, 'auth.login_failed', $user, $user, [
                'login' => $login,
                'portal' => $request->string('portal')->toString(),
            ]);

            throw ValidationException::withMessages(['login' => ['The provided credentials are incorrect.']]);
        }

        if (! $user->is_active) {
            $this->auditLogger->record($request, 'auth.inactive_login_rejected', $user, $user, [
                'portal' => $request->string('portal')->toString(),
            ]);

            return response()->json([
                'message' => 'This account is inactive.',
                'code' => 'ACCOUNT_INACTIVE',
            ], 403);
        }

        $portal = $request->string('portal')->toString();
        $portalAllowed = match ($portal) {
            'admin' => $user->hasAnyRole([RoleName::SuperAdmin->value, RoleName::OfficeAdmin->value]),
            'sales' => $user->hasRole(RoleName::SalesRepresentative->value)
                && $user->salesRepresentative()->where('is_active', true)->exists(),
            default => false,
        };

        if (! $portalAllowed) {
            $this->auditLogger->record($request, 'auth.portal_access_rejected', $user, $user, ['portal' => $portal]);

            $missingRepresentative = $portal === 'sales'
                && $user->hasRole(RoleName::SalesRepresentative->value);

            return response()->json([
                'message' => $missingRepresentative
                    ? 'The representative profile is missing or inactive.'
                    : 'This account cannot access the requested application.',
                'code' => $missingRepresentative ? 'REPRESENTATIVE_PROFILE_UNAVAILABLE' : 'PORTAL_ACCESS_DENIED',
            ], 403);
        }

        Auth::guard('web')->login($user, $request->boolean('remember'));
        $request->session()->regenerate();
        RateLimiter::clear($key);
        $user->forceFill(['last_login_at' => now()])->save();
        $this->auditLogger->record($request, 'auth.login_succeeded', $user, $user, [
            'portal' => $portal,
        ]);

        return response()->json(['user' => $this->userPayload($user)]);
    }

    public function show(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $this->auditLogger->record($request, 'auth.logout', $user, $user);
        Auth::guard('web')->logout();
        Auth::forgetGuards();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['message' => 'Logged out.']);
    }

    /** @return array<string, mixed> */
    private function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'is_active' => $user->is_active,
            'last_login_at' => $user->last_login_at?->toISOString(),
            'roles' => $user->getRoleNames()->values()->all(),
            'permissions' => $user->getAllPermissions()->pluck('name')->values()->all(),
            'warehouses' => $user->warehouses()->get(['warehouses.id', 'warehouses.code', 'warehouses.name'])->toArray(),
            'representative_id' => $user->salesRepresentative()->value('id'),
        ];
    }

    private function throttleKey(LoginRequest $request): string
    {
        return Str::transliterate(Str::lower($request->string('login')->toString()).'|'.$request->ip());
    }
}
