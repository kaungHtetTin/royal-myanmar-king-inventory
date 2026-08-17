<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class RequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $provided = $request->header('X-Request-ID');
        $requestId = is_string($provided) && preg_match('/^[A-Za-z0-9._-]{8,100}$/', $provided)
            ? $provided
            : (string) Str::uuid();

        $request->attributes->set('request_id', $requestId);
        Log::withContext([
            'request_id' => $requestId,
            'user_id' => $request->user()?->id,
            'route' => $request->route()?->getName() ?? $request->path(),
        ]);

        $response = $next($request);
        $response->headers->set('X-Request-ID', $requestId);

        return $response;
    }
}
