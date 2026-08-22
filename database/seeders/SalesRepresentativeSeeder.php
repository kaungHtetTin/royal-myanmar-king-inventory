<?php

namespace Database\Seeders;

use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class SalesRepresentativeSeeder extends Seeder
{
    public function run(): void
    {
        $records = [
            ['code' => 'SR-001', 'name' => 'Ko Aung', 'username' => 'koaung', 'email' => 'koaung@example.com', 'phone' => '09-450000001', 'warehouse' => 'YGN-MAIN', 'region' => 'Yangon', 'vehicle' => 'YGN-3N-4821'],
            ['code' => 'SR-002', 'name' => 'Ma Su', 'username' => 'masu', 'email' => null, 'phone' => '09-450000002', 'warehouse' => 'MDY-MAIN', 'region' => 'Mandalay', 'vehicle' => null],
        ];

        foreach ($records as $record) {
            DB::transaction(function () use ($record): void {
                $warehouse = Warehouse::query()->where('code', $record['warehouse'])->firstOrFail();
                $user = User::query()->updateOrCreate(['username' => $record['username']], [
                    'name' => $record['name'], 'email' => $record['email'], 'password' => 'password', 'is_active' => true, 'deactivated_at' => null,
                ]);
                $user->syncRoles([RoleName::SalesRepresentative->value]);
                $user->warehouses()->syncWithPivotValues([$warehouse->id], ['assigned_by' => User::query()->where('username', 'superadmin')->value('id')]);
                $representative = SalesRepresentative::query()->updateOrCreate(['code' => $record['code']], [
                    'user_id' => $user->id, 'primary_warehouse_id' => $warehouse->id, 'name' => $record['name'], 'phone' => $record['phone'],
                    'email' => $record['email'], 'region' => $record['region'], 'notes' => null, 'is_active' => true,
                ]);
                Vehicle::query()->where('sales_representative_id', $representative->id)->update(['sales_representative_id' => null]);
                if ($record['vehicle']) {
                    Vehicle::query()->where('vehicle_number', $record['vehicle'])->update(['sales_representative_id' => $representative->id]);
                }
            });
        }
    }
}
