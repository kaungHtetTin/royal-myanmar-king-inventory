<?php

namespace Database\Factories;

use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Product> */
class ProductFactory extends Factory
{
    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'sku' => strtoupper(fake()->unique()->bothify('PRD-#####')),
            'name' => fake()->words(3, true),
            'category' => fake()->randomElement(['Drinking Water', 'Mineral Water', 'Accessories']),
            'unit' => fake()->randomElement(['bottle', 'box', 'piece']),
            'selling_price' => fake()->numberBetween(500, 50000),
            'barcode' => fake()->unique()->ean13(),
            'description' => fake()->optional()->sentence(),
            'is_active' => true,
        ];
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['is_active' => false]);
    }
}
