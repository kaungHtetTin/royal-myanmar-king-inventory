<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Way;
use Illuminate\Database\Seeder;
use LogicException;

class CustomerSeeder extends Seeder
{
    public function run(): void
    {
        $customers = [
            ['code' => 'CUS-ABC', 'name' => 'ABC Shop', 'type' => 'Shop', 'phone' => '09-420000001', 'warehouse' => 'YGN-MAIN', 'region' => 'Yangon West', 'way' => 'Hlaing', 'address' => 'No. 18, Insein Road', 'credit_limit' => 2000000],
            ['code' => 'CUS-SHWE', 'name' => 'Shwe Distribution', 'type' => 'Distributor', 'phone' => '09-420000002', 'warehouse' => 'YGN-MAIN', 'region' => 'Yangon East', 'way' => 'Tamwe', 'address' => null],
            ['code' => 'CUS-MDY01', 'name' => 'Mandalay Corner Store', 'type' => 'Shop', 'phone' => '09-420000003', 'warehouse' => 'MDY-MAIN', 'region' => 'Mandalay Central', 'way' => 'Chanayethazan', 'address' => null],
            ['code' => 'CUS-MDY02', 'name' => 'Diamond Mini Mart', 'type' => 'Shop', 'phone' => '09-420000004', 'warehouse' => 'MDY-MAIN', 'region' => 'Mandalay South', 'way' => 'Chanmyathazi', 'address' => null],
            ['code' => 'CUS-NPT01', 'name' => 'Capital Store', 'type' => 'Shop', 'phone' => '09-420000005', 'warehouse' => 'NPT-MAIN', 'region' => 'Nay Pyi Taw North', 'way' => 'Zabuthiri', 'address' => null],
        ];

        foreach ($customers as $customer) {
            $way = Way::query()
                ->where('name', $customer['way'])
                ->whereHas('region', fn ($query) => $query
                    ->where('name', $customer['region'])
                    ->whereHas('warehouse', fn ($warehouse) => $warehouse->where('code', $customer['warehouse'])))
                ->with('region.warehouse')
                ->first();
            if (! $way) {
                throw new LogicException("Seeded way {$customer['way']} was not found in {$customer['region']}.");
            }

            Customer::query()->updateOrCreate(['code' => $customer['code']], [
                'warehouse_id' => $way->region->warehouse_id, 'way_id' => $way->id,
                'name' => $customer['name'], 'customer_type' => $customer['type'], 'phone' => $customer['phone'],
                'region' => $way->region->name, 'township' => $way->name, 'address' => $customer['address'],
                'credit_allowed' => isset($customer['credit_limit']), 'credit_limit' => $customer['credit_limit'] ?? 0,
                'notes' => null, 'is_active' => true,
            ]);
        }
    }
}
