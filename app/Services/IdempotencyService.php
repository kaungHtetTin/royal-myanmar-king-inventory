<?php

namespace App\Services;

use App\Exceptions\DomainConflictException;
use App\Models\IdempotencyKey;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;

class IdempotencyService
{
    /** @param Closure(): array<string, mixed> $callback
     * @return array<string, mixed>
     */
    public function execute(User $user, string $command, string $key, Closure $callback): array
    {
        return DB::transaction(function () use ($user, $command, $key, $callback): array {
            $wasCreated = IdempotencyKey::query()->insertOrIgnore([
                'user_id' => $user->id,
                'command' => $command,
                'key' => $key,
                'status' => 'processing',
                'created_at' => now(),
                'updated_at' => now(),
            ]) === 1;
            $record = IdempotencyKey::query()
                ->where('user_id', $user->id)
                ->where('command', $command)
                ->where('key', $key)
                ->lockForUpdate()->firstOrFail();
            if ($record->status === 'completed') {
                return $record->result;
            }
            if (! $wasCreated) {
                throw new DomainConflictException('This command is already being processed.', 'COMMAND_IN_PROGRESS');
            }

            $result = $callback();
            $record->update(['status' => 'completed', 'result' => $result]);

            return $result;
        }, 3);
    }
}
