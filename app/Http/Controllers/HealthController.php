<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = ['database' => false, 'cache' => false];

        try {
            DB::select('select 1');
            $checks['database'] = true;
        } catch (Throwable $exception) {
            Log::warning('Readiness database check failed.', ['exception' => $exception::class]);
        }

        try {
            $key = 'health:'.bin2hex(random_bytes(8));
            Cache::put($key, 'ok', 10);
            $checks['cache'] = Cache::get($key) === 'ok';
            Cache::forget($key);
        } catch (Throwable $exception) {
            Log::warning('Readiness cache check failed.', ['exception' => $exception::class]);
        }

        $healthy = ! in_array(false, $checks, true);

        return response()->json([
            'status' => $healthy ? 'ok' : 'degraded',
            'service' => config('app.name'),
            'version' => config('operations.release.version'),
            'deployment_id' => config('operations.release.deployment_id'),
            'checks' => $checks,
            'checked_at' => now()->toISOString(),
        ], $healthy ? 200 : 503);
    }
}
