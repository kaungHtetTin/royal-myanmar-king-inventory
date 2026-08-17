<?php

use App\Exceptions\DomainConflictException;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\Sale;
use App\Models\User;
use App\Services\CustomerCreditMutation;
use App\Services\RepresentativeInventoryMutation;
use App\Services\SalePostingService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
[, $saleId, $userId, $key] = $argv;
$mode = $argv[4] ?? null;
$readyFile = $argv[5] ?? null;
$releaseFile = $argv[6] ?? null;

$wait = static function (string $ready, string $release): void {
    file_put_contents($ready, 'locked');
    $deadline = microtime(true) + 10;
    while (! is_file($release) && microtime(true) < $deadline) {
        usleep(20_000);
    }
    if (! is_file($release)) {
        throw new RuntimeException('Timed out waiting to release the sale lock.');
    }
};

if ($mode === 'stock' && $readyFile && $releaseFile) {
    $app->instance(RepresentativeInventoryMutation::class, new class($readyFile, $releaseFile, $wait) extends RepresentativeInventoryMutation
    {
        public function __construct(private readonly string $readyFile, private readonly string $releaseFile, private readonly Closure $wait) {}

        public function lock(int $representativeId, array $productIds): Collection
        {
            $balances = parent::lock($representativeId, $productIds);
            ($this->wait)($this->readyFile, $this->releaseFile);

            return $balances;
        }
    });
}
if ($mode === 'credit' && $readyFile && $releaseFile) {
    $app->instance(CustomerCreditMutation::class, new class($readyFile, $releaseFile, $wait) extends CustomerCreditMutation
    {
        public function __construct(private readonly string $readyFile, private readonly string $releaseFile, private readonly Closure $wait) {}

        public function lock(Customer $customer): CustomerCreditBalance
        {
            $balance = parent::lock($customer);
            ($this->wait)($this->readyFile, $this->releaseFile);

            return $balance;
        }
    });
}

$sale = Sale::query()->findOrFail((int) $saleId);
$actor = User::query()->findOrFail((int) $userId);
$request = Request::create('/tests/mysql-phase5-concurrency', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'Phase5ConcurrencyTest']);
$request->setUserResolver(fn () => $actor);
try {
    app(SalePostingService::class)->post($sale, $actor, $key, $request);
    fwrite(STDOUT, "POSTED\n");
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, ($exception instanceof DomainConflictException ? $exception->errorCode : $exception::class).': '.$exception->getMessage()."\n");
    exit(2);
}
