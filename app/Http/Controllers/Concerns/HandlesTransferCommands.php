<?php

namespace App\Http\Controllers\Concerns;

use Illuminate\Http\Request;

trait HandlesTransferCommands
{
    protected function idempotencyKey(Request $request): string
    {
        $request->merge(['idempotency_key' => $request->header('Idempotency-Key')]);

        return $request->validate(['idempotency_key' => ['required', 'string', 'max:100']])['idempotency_key'];
    }

    protected function commandReason(Request $request): string
    {
        return trim($request->validate(['reason' => ['required', 'string', 'max:500']])['reason']);
    }
}
