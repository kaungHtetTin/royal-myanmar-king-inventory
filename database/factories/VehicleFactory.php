<?php

namespace Database\Factories;

use App\Models\Vehicle;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Vehicle> */
class VehicleFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'vehicle_number' => strtoupper(fake()->unique()->bothify('YGN-##-####')),
            'vehicle_type' => fake()->randomElement(['Van', 'Truck', 'Motorcycle']),
            'brand' => fake()->randomElement(['Toyota', 'Suzuki', 'Honda']),
            'model' => fake()->optional()->bothify('Model-##'),
            'sales_representative_id' => null,
            'is_active' => true,
            'notes' => null,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
