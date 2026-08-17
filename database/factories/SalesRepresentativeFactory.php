<?php

namespace Database\Factories;

use App\Enums\RoleName;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<SalesRepresentative> */
class SalesRepresentativeFactory extends Factory
{
    public function definition(): array
    {
        return [
            'code' => fake()->unique()->bothify('SR-###'),
            'user_id' => User::factory()->afterCreating(fn (User $user) => $user->assignRole(RoleName::SalesRepresentative->value)),
            'primary_warehouse_id' => Warehouse::query()->first()?->id
                ?? Warehouse::query()->create(['code' => fake()->unique()->lexify('WH-???'), 'name' => fake()->city().' Warehouse'])->id,
            'name' => fake()->name(),
            'phone' => fake()->phoneNumber(),
            'email' => fake()->safeEmail(),
            'region' => fake()->city(),
            'notes' => null,
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
