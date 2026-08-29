<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSalesRepresentative
{
    public function handle(Request $request, Closure $next): Response
    {
        $representative = $request->user()?->salesRepresentative;

        if (! $representative?->is_active) {
            return new JsonResponse([
                'message' => 'The representative profile is missing or inactive.',
                'code' => 'REPRESENTATIVE_PROFILE_UNAVAILABLE',
            ], Response::HTTP_FORBIDDEN);
        }

        return $next($request);
    }
}
