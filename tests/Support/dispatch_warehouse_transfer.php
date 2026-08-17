<?php

use App\Exceptions\DomainConflictException;
use App\Models\User;
use App\Models\WarehouseTransfer;
use App\Services\WarehouseInventoryMutation;
use App\Services\WarehouseTransferPostingService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
[, $transferId, $userId, $key] = $argv;
$readyFile = $argv[4] ?? null;
$releaseFile = $argv[5] ?? null;

if ($readyFile && $releaseFile) {
    $app->instance(WarehouseInventoryMutation::class, new class($readyFile, $releaseFile) extends WarehouseInventoryMutation
    {
        public function __construct(private readonly string $readyFile, private readonly string $releaseFile) {}

        public function lock(int $warehouseId, array $productIds): Collection
        {
            $balances = parent::lock($warehouseId, $productIds);
            file_put_contents($this->readyFile, 'locked');
            $deadline = microtime(true) + 10;
            while (! is_file($this->releaseFile) && microtime(true) < $deadline) {
                usleep(20_000);
            }
            if (! is_file($this->releaseFile)) {
                throw new RuntimeException('Timed out waiting to release the warehouse lock.');
            }

            return $balances;
        }
    });
}

$transfer = WarehouseTransfer::query()->findOrFail((int) $transferId);
$actor = User::query()->findOrFail((int) $userId);
$request = Request::create('/tests/mysql-phase4-concurrency', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'Phase4ConcurrencyTest']);
$request->setUserResolver(fn () => $actor);
try {
    app(WarehouseTransferPostingService::class)->dispatch($transfer, $actor, $key, $request);
    fwrite(STDOUT, "DISPATCHED\n");
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, ($exception instanceof DomainConflictException ? $exception->errorCode : $exception::class).': '.$exception->getMessage()."\n");
    exit(2);
}
