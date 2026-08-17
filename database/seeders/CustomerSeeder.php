<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Warehouse;
use Illuminate\Database\Seeder;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $yangon = Warehouse::query()->where('code', 'YGN-MAIN')->firstOrFail();
        $mandalay = Warehouse::query()->where('code', 'MDY-MAIN')->firstOrFail();
        $customers = [
            ['warehouse_id' => $yangon->id, 'code' => 'CUS-ABC', 'name' => 'ABC Shop', 'customer_type' => 'Shop', 'phone' => '09-420000001', 'region' => 'Yangon', 'township' => 'Hlaing', 'address' => 'No. 18, Insein Road', 'credit_allowed' => true, 'credit_limit' => 2000000],
            ['warehouse_id' => $yangon->id, 'code' => 'CUS-SHWE', 'name' => 'Shwe Distribution', 'customer_type' => 'Distributor', 'phone' => '09-420000002', 'region' => 'Yangon', 'township' => 'Tamwe', 'address' => null, 'credit_allowed' => true, 'credit_limit' => 5000000],
            ['warehouse_id' => $mandalay->id, 'code' => 'CUS-MDY01', 'name' => 'Mandalay Corner Store', 'customer_type' => 'Shop', 'phone' => '09-420000003', 'region' => 'Mandalay', 'township' => 'Chanayethazan', 'address' => null, 'credit_allowed' => false, 'credit_limit' => 0],
        ];

        foreach ($customers as $customer) {
            Customer::query()->updateOrCreate(['code' => $customer['code']], $customer + ['notes' => null, 'is_active' => true]);
        }
    }
}
