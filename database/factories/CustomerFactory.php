<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Customer> */
class CustomerFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'warehouse_id' => Warehouse::factory(),
            'code' => strtoupper(fake()->unique()->bothify('CUS-####')),
            'name' => fake()->company(),
            'customer_type' => fake()->randomElement(['End User', 'Shop', 'Distributor', 'Other Business']),
            'phone' => fake()->phoneNumber(),
            'region' => fake()->state(),
            'township' => fake()->city(),
            'address' => fake()->streetAddress(),
            'credit_allowed' => false,
            'credit_limit' => 0,
            'notes' => null,
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }

    public function withCredit(int $limit = 2000000): static
    {
        return $this->state(fn () => ['credit_allowed' => true, 'credit_limit' => $limit]);
    }
}
