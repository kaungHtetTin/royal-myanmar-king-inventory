<?php

namespace Database\Seeders;

use App\Models\Vehicle;
use Illuminate\Database\Seeder;

class VehicleSeeder extends Seeder
{
    public function run(): void
    {
        $vehicles = [
            ['vehicle_number' => 'YGN-3N-4821', 'vehicle_type' => 'Van', 'brand' => 'Toyota', 'model' => 'Hiace', 'notes' => 'Yangon distribution vehicle.'],
            ['vehicle_number' => 'MDY-5J-1934', 'vehicle_type' => 'Truck', 'brand' => 'Isuzu', 'model' => 'N-Series', 'notes' => 'Regional bulk deliveries.'],
            ['vehicle_number' => 'YGN-42W-7810', 'vehicle_type' => 'Motorcycle', 'brand' => 'Honda', 'model' => 'Wave', 'notes' => null],
        ];

        foreach ($vehicles as $vehicle) {
            Vehicle::query()->updateOrCreate(['vehicle_number' => $vehicle['vehicle_number']], $vehicle + [
                'sales_representative_id' => null,
                'is_active' => true,
            ]);
        }
    }
}
