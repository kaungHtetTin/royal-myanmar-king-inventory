<?php

namespace App\Services;

use App\Models\ApplicationSetting;

class PaymentMethodRegistry
{
    /** @return list<array{key: string, name: string, adds_to_cash_hold: bool, is_active: bool}> */
    public function all(): array
    {
        $methods = ApplicationSetting::current()->payment_methods;

        return collect(is_array($methods) ? $methods : $this->defaults())
            ->map(fn (array $method): array => [
                'key' => (string) ($method['key'] ?? ''),
                'name' => (string) ($method['name'] ?? ''),
                'adds_to_cash_hold' => (bool) ($method['adds_to_cash_hold'] ?? false),
                'is_active' => (bool) ($method['is_active'] ?? true),
            ])->filter(fn (array $method) => $method['key'] !== '' && $method['name'] !== '')
            ->values()->all();
    }

    /** @return list<array{key: string, name: string, adds_to_cash_hold: bool, is_active: bool}> */
    public function active(): array
    {
        return array_values(array_filter($this->all(), fn (array $method) => $method['is_active']));
    }

    /** @return list<string> */
    public function activeKeys(): array
    {
        return array_column($this->active(), 'key');
    }

    public function addsToCashHold(?string $key): bool
    {
        $method = collect($this->all())->firstWhere('key', $key);

        return (bool) ($method['adds_to_cash_hold'] ?? false);
    }

    public function defaultKey(): string
    {
        $methods = collect($this->active());

        return (string) (($methods->firstWhere('adds_to_cash_hold', true) ?? $methods->first() ?? ['key' => 'cash'])['key']);
    }

    public function name(?string $key): string
    {
        $method = collect($this->all())->firstWhere('key', $key);

        return $method ? $method['name'] : (string) str($key ?? '')->replace('_', ' ')->title();
    }

    /** @return list<array{key: string, name: string, adds_to_cash_hold: bool, is_active: bool}> */
    public function defaults(): array
    {
        return [
            ['key' => 'cash', 'name' => 'Cash', 'adds_to_cash_hold' => true, 'is_active' => true],
            ['key' => 'banking', 'name' => 'Banking', 'adds_to_cash_hold' => false, 'is_active' => true],
        ];
    }
}
