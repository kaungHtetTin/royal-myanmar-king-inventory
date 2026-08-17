<?php

use App\Exceptions\DomainConflictException;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\CustomerPayment;
use App\Models\User;
use App\Services\CustomerCreditMutation;
use App\Services\CustomerPaymentPostingService;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Request;

require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
[, $paymentId, $userId, $key] = $argv;
$ready = $argv[4] ?? null;
$release = $argv[5] ?? null;
if ($ready && $release) {
    $app->instance(CustomerCreditMutation::class, new class($ready, $release) extends CustomerCreditMutation
    {
        public function __construct(private readonly string $ready, private readonly string $release) {}

        public function lock(Customer $customer): CustomerCreditBalance
        {
            $balance = parent::lock($customer);
            file_put_contents($this->ready, 'locked');
            $deadline = microtime(true) + 10;
            while (! is_file($this->release) && microtime(true) < $deadline) {
                usleep(20_000);
            }
            if (! is_file($this->release)) {
                throw new RuntimeException('Timed out waiting to release the credit balance lock.');
            }

            return $balance;
        }
    });
}
$payment = CustomerPayment::query()->findOrFail((int) $paymentId);
$actor = User::query()->findOrFail((int) $userId);
$request = Request::create('/tests/mysql-phase6-concurrency', 'POST');
$request->setUserResolver(fn () => $actor);
try {
    app(CustomerPaymentPostingService::class)->post($payment, $actor, $key, $request);
    fwrite(STDOUT, "POSTED\n");
    exit(0);
} catch (Throwable $exception) {
    fwrite(STDERR, ($exception instanceof DomainConflictException ? $exception->errorCode : $exception::class).': '.$exception->getMessage()."\n");
    exit(2);
}
