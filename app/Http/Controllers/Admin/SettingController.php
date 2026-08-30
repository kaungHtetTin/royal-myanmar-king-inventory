<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\BrandingController;
use App\Http\Controllers\Controller;
use App\Models\ApplicationSetting;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\File;
use Illuminate\Validation\ValidationException;

class SettingController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function show(Request $request): JsonResponse
    {
        $settings = ApplicationSetting::current();

        return response()->json([
            'branding' => BrandingController::payload($settings),
            'operations' => $this->operations($settings),
            'profile' => $this->profile($request->user()),
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['required', 'string', 'max:100', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users')->ignore($user)],
            'email' => ['nullable', 'email', 'max:255', Rule::unique('users')->ignore($user)],
            'current_password' => ['nullable', 'required_with:password', 'string', 'min:6'],
            'password' => ['nullable', 'string', 'min:6', 'confirmed'],
        ]);

        if (! empty($data['password']) && ! Hash::check($data['current_password'], $user->password)) {
            throw ValidationException::withMessages(['current_password' => ['The current password is incorrect.']]);
        }

        $old = $user->only(['name', 'username', 'email']);
        $user->fill([
            'name' => $data['name'],
            'username' => $data['username'],
            'email' => $data['email'] ?? null,
        ]);
        if (! empty($data['password'])) {
            $user->password = $data['password'];
        }
        $user->save();
        $this->auditLogger->record($request, 'settings.profile_updated', $user, $user, [
            'old' => $old,
            'new' => $user->only(['name', 'username', 'email']),
            'password_changed' => ! empty($data['password']),
        ]);

        return response()->json(['profile' => $this->profile($user)]);
    }

    public function update(Request $request): JsonResponse
    {
        if (is_string($request->input('payment_methods'))) {
            $request->merge(['payment_methods' => json_decode($request->string('payment_methods')->toString(), true)]);
        }
        $data = $request->validate([
            'business_name' => ['required', 'string', 'max:120'],
            'business_tagline' => ['nullable', 'string', 'max:160'],
            'primary_color' => ['required', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'business_email' => ['nullable', 'email', 'max:255'],
            'business_phone' => ['nullable', 'string', 'max:50'],
            'business_address' => ['nullable', 'string', 'max:500'],
            'currency_code' => ['required', Rule::in(['MMK', 'USD', 'THB', 'CNY'])],
            'timezone' => ['required', 'timezone'],
            'low_stock_threshold' => ['required', 'integer', 'min:0', 'max:1000000'],
            'invoice_footer' => ['nullable', 'string', 'max:500'],
            'payment_methods' => ['sometimes', 'array', 'min:1', 'max:20'],
            'payment_methods.*.key' => ['required', 'string', 'max:50', 'regex:/^[a-z0-9_]+$/', 'distinct'],
            'payment_methods.*.name' => ['required', 'string', 'max:80'],
            'payment_methods.*.adds_to_cash_hold' => ['required', 'boolean'],
            'payment_methods.*.is_active' => ['required', 'boolean'],
            'logo' => ['nullable', File::image()->types(['png', 'jpg', 'jpeg', 'webp'])->max(2048)],
            'favicon' => ['nullable', File::image()->types(['png', 'jpg', 'jpeg', 'webp'])->max(1024)],
            'remove_logo' => ['nullable', 'boolean'],
            'remove_favicon' => ['nullable', 'boolean'],
        ]);
        if (isset($data['payment_methods']) && ! collect($data['payment_methods'])->contains(fn (array $method) => $method['is_active'] && $method['adds_to_cash_hold'])) {
            throw ValidationException::withMessages([
                'payment_methods' => ['Keep at least one active method that adds physical cash to the representative cash hold.'],
            ]);
        }

        $settings = ApplicationSetting::query()->firstOrCreate(['id' => 1]);
        $old = $settings->toArray();
        $paths = ['logo' => $settings->logo_path, 'favicon' => $settings->favicon_path];

        foreach (['logo', 'favicon'] as $asset) {
            if ($request->hasFile($asset)) {
                $newPath = $request->file($asset)->store('branding', 'public');
                abort_unless($newPath, 500, "Unable to store the {$asset}.");
                if ($paths[$asset]) {
                    Storage::disk('public')->delete($paths[$asset]);
                }
                $settings->{"{$asset}_path"} = $newPath;
            } elseif ($request->boolean("remove_{$asset}")) {
                if ($paths[$asset]) {
                    Storage::disk('public')->delete($paths[$asset]);
                }
                $settings->{"{$asset}_path"} = null;
            }
        }

        $settings->fill(collect($data)->except(['logo', 'favicon', 'remove_logo', 'remove_favicon'])->all());
        $settings->updated_by = $request->user()->id;
        $settings->save();
        $this->auditLogger->record($request, 'settings.application_updated', $request->user(), $settings, [
            'old' => $old,
            'new' => $settings->fresh()->toArray(),
        ]);

        return response()->json([
            'branding' => BrandingController::payload($settings),
            'operations' => $this->operations($settings),
        ]);
    }

    /** @return array<string, mixed> */
    private function operations(ApplicationSetting $settings): array
    {
        return $settings->only([
            'business_email',
            'business_phone',
            'business_address',
            'currency_code',
            'timezone',
            'low_stock_threshold',
            'invoice_footer',
            'payment_methods',
        ]);
    }

    /** @return array<string, mixed> */
    private function profile(User $user): array
    {
        return $user->only(['id', 'name', 'username', 'email']);
    }
}
