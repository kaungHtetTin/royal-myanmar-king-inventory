<?php

namespace App\Http\Controllers;

use App\Models\ApplicationSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class BrandingController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json($this->payload(ApplicationSetting::current()));
    }

    public function asset(string $asset): BinaryFileResponse
    {
        abort_unless(in_array($asset, ['logo', 'favicon'], true), 404);
        $settings = ApplicationSetting::current();
        $path = $asset === 'logo' ? $settings->logo_path : $settings->favicon_path;
        abort_unless($path && Storage::disk('public')->exists($path), 404);

        return response()->file(Storage::disk('public')->path($path), [
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    /** @return array<string, mixed> */
    public static function payload(ApplicationSetting $settings): array
    {
        $version = $settings->updated_at?->timestamp ?? 0;

        return [
            'business_name' => $settings->business_name,
            'business_tagline' => $settings->business_tagline,
            'primary_color' => $settings->primary_color,
            'logo_url' => $settings->logo_path ? url("/api/branding/assets/logo?v={$version}") : null,
            'favicon_url' => $settings->favicon_path ? url("/api/branding/assets/favicon?v={$version}") : null,
            'business_email' => $settings->business_email,
            'business_phone' => $settings->business_phone,
            'business_address' => $settings->business_address,
            'currency_code' => $settings->currency_code,
            'invoice_footer' => $settings->invoice_footer,
        ];
    }
}
