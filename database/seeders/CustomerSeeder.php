<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Region;
use Illuminate\Database\Seeder;
use LogicException;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['code' => 'CUS-ABC', 'name' => 'ABC Shop', 'type' => 'Shop', 'phone' => '09-420000001', 'warehouse' => 'YGN-MAIN', 'region' => 'Yangon West', 'township' => 'Hlaing', 'address' => 'No. 18, Insein Road', 'credit_limit' => 2000000],
            ['code' => 'CUS-SHWE', 'name' => 'Shwe Distribution', 'type' => 'Distributor', 'phone' => '09-420000002', 'warehouse' => 'YGN-MAIN', 'region' => 'Yangon East', 'township' => 'Tamwe', 'address' => null],
            ['code' => 'CUS-MDY01', 'name' => 'Mandalay Corner Store', 'type' => 'Shop', 'phone' => '09-420000003', 'warehouse' => 'MDY-MAIN', 'region' => 'Mandalay Central', 'township' => 'Chanayethazan', 'address' => null],
            ['code' => 'CUS-MDY02', 'name' => 'Diamond Mini Mart', 'type' => 'Shop', 'phone' => '09-420000004', 'warehouse' => 'MDY-MAIN', 'region' => 'Mandalay South', 'township' => 'Chanmyathazi', 'address' => null],
            ['code' => 'CUS-NPT01', 'name' => 'Capital Store', 'type' => 'Shop', 'phone' => '09-420000005', 'warehouse' => 'NPT-MAIN', 'region' => 'Nay Pyi Taw North', 'township' => 'Zabuthiri', 'address' => null],
        ];

        foreach ($customers as $customer) {
            $region = Region::query()->where('name', $customer['region'])
                ->whereHas('warehouse', fn ($warehouse) => $warehouse->where('code', $customer['warehouse']))
                ->with('warehouse')
                ->first();
            if (! $region) {
                throw new LogicException("Seeded region {$customer['region']} was not found.");
            }

            Customer::query()->updateOrCreate(['code' => $customer['code']], [
                'warehouse_id' => $region->warehouse_id, 'region_id' => $region->id,
                'name' => $customer['name'], 'customer_type' => $customer['type'], 'phone' => $customer['phone'],
                'region' => $region->name, 'township' => $customer['township'], 'address' => $customer['address'],
                'credit_allowed' => isset($customer['credit_limit']), 'credit_limit' => $customer['credit_limit'] ?? 0,
                'notes' => null, 'is_active' => true,
            ]);
        }
    }
}
