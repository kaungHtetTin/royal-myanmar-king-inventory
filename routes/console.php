<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('inventory:backup')
    ->dailyAt('01:30')
    ->timezone(config('app.timezone'))
    ->withoutOverlapping(180)
    ->onOneServer();

Schedule::command('inventory:readiness --production --stage=preflight --json')
    ->hourly()
    ->withoutOverlapping(30)
    ->appendOutputTo(storage_path('logs/readiness.log'));
