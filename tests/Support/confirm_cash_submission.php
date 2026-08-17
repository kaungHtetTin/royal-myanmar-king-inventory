<?php

use App\Exceptions\DomainConflictException;
use App\Models\CashSubmission;
use App\Models\RepresentativeCashBalance;
use App\Models\User;
use App\Services\CashSubmissionService;
use App\Services\RepresentativeCashMutation;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
[, $submissionId, $userId, $key] = $argv;
$ready = $argv[4] ?? null;
$release = $argv[5] ?? null;
if ($ready && $release) {
    $app->instance(RepresentativeCashMutation::class, new class($ready, $release) extends RepresentativeCashMutation
    {
        public function __construct(private readonly string $ready, private readonly string $release) {}

        public function lock(int $representativeId): RepresentativeCashBalance
        {
            $balance = parent::lock($representativeId);
            file_put_contents($this->ready, 'locked');
            $deadline = microtime(true) + 10;
            while (! is_file($this->release) && microtime(true) < $deadline) {
                usleep(20_000);
            }
            if (! is_file($this->release)) {
                throw new RuntimeException('Timed out waiting to release the cash balance lock.');
            }

            return $balance;
        }
    });
}
$submission = CashSubmission::query()->findOrFail((int) $submissionId);
$actor = User::query()->findOrFail((int) $userId);
$request = Request::create('/tests/mysql-phase6-concurrency', 'POST');
$request->setUserResolver(fn () => $actor);
try {
    app(CashSubmissionService::class)->confirm($submission, $actor, $key, $request);
    fwrite(STDOUT, "CONFIRMED\n");
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, ($exception instanceof DomainConflictException ? $exception->errorCode : $exception::class).': '.$exception->getMessage()."\n");
    exit(2);
}
