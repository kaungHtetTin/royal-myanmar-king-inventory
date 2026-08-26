<?php

namespace Database\Seeders;

use App\Enums\RoleName;
use App\Models\ApplicationSetting;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use LogicException;

class EssentialSetupSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $password = env('SUPER_ADMIN_PASSWORD');

        if (! $password && app()->isProduction()) {
            throw new LogicException('SUPER_ADMIN_PASSWORD must be configured before production seeding.');
        }

        DB::transaction(function () use ($password): void {
            $this->call(AccessControlSeeder::class);

            $admin = User::query()->firstOrNew([
                'username' => env('SUPER_ADMIN_USERNAME', 'superadmin'),
            ]);

            $admin->fill([
                'name' => env('SUPER_ADMIN_NAME', 'Super Admin'),
                'email' => env('SUPER_ADMIN_EMAIL', 'admin@stockflow.local'),
                'is_active' => true,
                'deactivated_at' => null,
            ]);

            if (! $admin->exists || $password) {
                $admin->password = $password ?: 'password';
            }

            $admin->save();
            $admin->syncRoles([RoleName::SuperAdmin->value]);

            ApplicationSetting::query()->firstOrCreate([], [
                'business_name' => 'StockFlow',
                'primary_color' => '#087f74',
                'currency_code' => 'MMK',
                'timezone' => env('APP_TIMEZONE', 'Asia/Yangon'),
                'low_stock_threshold' => 10,
                'updated_by' => $admin->id,
            ]);
        });
    }
}
