<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Product;
use App\Models\SalesRepresentative;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Warehouse;
use Illuminate\Support\Facades\Validator;

class MasterDataTemplateValidator
{
    /** @var array<string, array{key: string, headers: list<string>, rules: array<string, list<string>>}> */
    private array $specifications = [
        'warehouses.csv' => [
            'key' => 'code',
            'headers' => ['code', 'name', 'region', 'township', 'address', 'phone', 'is_active'],
            'rules' => ['code' => ['required', 'regex:/^[A-Z0-9-]+$/', 'max:30'], 'name' => ['required', 'max:150'], 'region' => ['required', 'max:100'], 'township' => ['nullable', 'max:100'], 'address' => ['nullable', 'max:500'], 'phone' => ['nullable', 'max:50'], 'is_active' => ['required', 'in:0,1']],
        ],
        'products.csv' => [
            'key' => 'sku',
            'headers' => ['sku', 'name', 'category', 'unit', 'selling_price', 'barcode', 'is_active'],
            'rules' => ['sku' => ['required', 'regex:/^[A-Z0-9-]+$/', 'max:50'], 'name' => ['required', 'max:150'], 'category' => ['required', 'max:100'], 'unit' => ['required', 'max:50'], 'selling_price' => ['required', 'integer', 'min:0'], 'barcode' => ['nullable', 'max:100'], 'is_active' => ['required', 'in:0,1']],
        ],
        'vehicles.csv' => [
            'key' => 'vehicle_number',
            'headers' => ['vehicle_number', 'vehicle_type', 'brand', 'model', 'is_active'],
            'rules' => ['vehicle_number' => ['required', 'max:50'], 'vehicle_type' => ['required', 'max:100'], 'brand' => ['nullable', 'max:100'], 'model' => ['nullable', 'max:100'], 'is_active' => ['required', 'in:0,1']],
        ],
        'customers.csv' => [
            'key' => 'code',
            'headers' => ['code', 'name', 'warehouse_code', 'customer_type', 'phone', 'region', 'township', 'address', 'credit_allowed', 'credit_limit', 'is_active'],
            'rules' => ['code' => ['required', 'regex:/^[A-Z0-9-]+$/', 'max:50'], 'name' => ['required', 'max:150'], 'warehouse_code' => ['required', 'max:30'], 'customer_type' => ['required', 'in:retail,wholesale'], 'phone' => ['nullable', 'max:50'], 'region' => ['nullable', 'max:100'], 'township' => ['nullable', 'max:100'], 'address' => ['nullable', 'max:500'], 'credit_allowed' => ['required', 'in:0,1'], 'credit_limit' => ['required', 'integer', 'min:0'], 'is_active' => ['required', 'in:0,1']],
        ],
        'representatives.csv' => [
            'key' => 'code',
            'headers' => ['code', 'name', 'username', 'email', 'phone', 'warehouse_code', 'region', 'vehicle_number', 'is_active'],
            'rules' => ['code' => ['required', 'regex:/^[A-Z0-9-]+$/', 'max:50'], 'name' => ['required', 'max:150'], 'username' => ['required', 'regex:/^[a-zA-Z0-9._-]+$/', 'max:100'], 'email' => ['nullable', 'email', 'max:150'], 'phone' => ['nullable', 'max:50'], 'warehouse_code' => ['required', 'max:30'], 'region' => ['nullable', 'max:100'], 'vehicle_number' => ['nullable', 'max:50'], 'is_active' => ['required', 'in:0,1']],
        ],
        'office-users.csv' => [
            'key' => 'username',
            'headers' => ['username', 'name', 'email', 'role', 'warehouse_codes', 'is_active'],
            'rules' => ['username' => ['required', 'regex:/^[a-zA-Z0-9._-]+$/', 'max:100'], 'name' => ['required', 'max:150'], 'email' => ['nullable', 'email', 'max:150'], 'role' => ['required', 'in:office-admin'], 'warehouse_codes' => ['required'], 'is_active' => ['required', 'in:0,1']],
        ],
        'opening-stock.csv' => [
            'key' => 'warehouse_code,sku',
            'headers' => ['warehouse_code', 'sku', 'quantity', 'notes'],
            'rules' => ['warehouse_code' => ['required', 'max:30'], 'sku' => ['required', 'max:50'], 'quantity' => ['required', 'integer', 'min:1'], 'notes' => ['nullable', 'max:500']],
        ],
    ];

    /** @return array{valid: bool, files: array<string, int>, errors: list<string>} */
    public function validate(string $directory, bool $allowExisting = false): array
    {
        $errors = [];
        $files = [];
        $rows = [];

        foreach ($this->specifications as $filename => $specification) {
            $path = rtrim($directory, '\\/').DIRECTORY_SEPARATOR.$filename;
            if (! is_file($path) || ! is_readable($path)) {
                $errors[] = "{$filename}: file is missing or unreadable.";

                continue;
            }

            [$fileRows, $fileErrors] = $this->read($path, $filename, $specification);
            $rows[$filename] = $fileRows;
            $files[$filename] = count($fileRows);
            array_push($errors, ...$fileErrors);
        }

        if (count($rows) === count($this->specifications)) {
            array_push($errors, ...$this->crossValidate($rows, $allowExisting));
        }

        return ['valid' => $errors === [], 'files' => $files, 'errors' => $errors];
    }

    /**
     * @param  array{key: string, headers: list<string>, rules: array<string, list<string>>}  $specification
     * @return array{list<array<string, string>>, list<string>}
     */
    private function read(string $path, string $filename, array $specification): array
    {
        $errors = [];
        $rows = [];
        $handle = fopen($path, 'rb');
        $headers = fgetcsv($handle);
        if ($headers === false) {
            fclose($handle);

            return [[], ["{$filename}: header row is missing."]];
        }
        $headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");
        if ($headers !== $specification['headers']) {
            $errors[] = "{$filename}: headers must be exactly ".implode(',', $specification['headers']).'.';
        }

        $seen = [];
        $line = 1;
        while (($values = fgetcsv($handle)) !== false) {
            $line++;
            if (count($values) === 1 && trim((string) $values[0]) === '') {
                continue;
            }
            if (count($values) !== count($headers)) {
                $errors[] = "{$filename}:{$line}: expected ".count($headers).' columns.';

                continue;
            }
            $row = array_map(fn ($value) => trim((string) $value), array_combine($headers, $values));
            $validation = Validator::make($row, $specification['rules']);
            foreach ($validation->errors()->all() as $message) {
                $errors[] = "{$filename}:{$line}: {$message}";
            }
            $key = implode('|', array_map(fn ($column) => strtoupper($row[$column] ?? ''), explode(',', $specification['key'])));
            if (isset($seen[$key])) {
                $errors[] = "{$filename}:{$line}: duplicate key {$key}.";
            }
            $seen[$key] = true;
            $rows[] = $row;
        }
        fclose($handle);

        return [$rows, $errors];
    }

    /** @param array<string, list<array<string, string>>> $rows
     * @return list<string>
     */
    private function crossValidate(array $rows, bool $allowExisting): array
    {
        $errors = [];
        $uppercase = fn ($value) => strtoupper((string) $value);
        $warehouseCodes = collect($rows['warehouses.csv'])->pluck('code')->map($uppercase)->merge(Warehouse::query()->pluck('code')->map($uppercase))->unique();
        $skus = collect($rows['products.csv'])->pluck('sku')->map($uppercase)->merge(Product::query()->pluck('sku')->map($uppercase))->unique();
        $vehicleNumbers = collect($rows['vehicles.csv'])->pluck('vehicle_number')->map($uppercase)->merge(Vehicle::query()->pluck('vehicle_number')->map($uppercase))->unique();

        foreach (['customers.csv', 'representatives.csv'] as $filename) {
            foreach ($rows[$filename] as $index => $row) {
                if (! $warehouseCodes->contains(strtoupper($row['warehouse_code']))) {
                    $errors[] = $filename.':'.($index + 2).": unknown warehouse_code {$row['warehouse_code']}.";
                }
            }
        }
        foreach ($rows['representatives.csv'] as $index => $row) {
            if ($row['vehicle_number'] !== '' && ! $vehicleNumbers->contains(strtoupper($row['vehicle_number']))) {
                $errors[] = 'representatives.csv:'.($index + 2).": unknown vehicle_number {$row['vehicle_number']}.";
            }
        }
        foreach ($rows['office-users.csv'] as $index => $row) {
            foreach (array_filter(array_map('trim', explode('|', $row['warehouse_codes']))) as $code) {
                if (! $warehouseCodes->contains(strtoupper($code))) {
                    $errors[] = 'office-users.csv:'.($index + 2).": unknown warehouse code {$code}.";
                }
            }
        }
        foreach ($rows['opening-stock.csv'] as $index => $row) {
            if (! $warehouseCodes->contains(strtoupper($row['warehouse_code']))) {
                $errors[] = 'opening-stock.csv:'.($index + 2).": unknown warehouse_code {$row['warehouse_code']}.";
            }
            if (! $skus->contains(strtoupper($row['sku']))) {
                $errors[] = 'opening-stock.csv:'.($index + 2).": unknown sku {$row['sku']}.";
            }
        }

        if (! $allowExisting) {
            $errors = [...$errors, ...$this->existingConflicts($rows)];
        }

        return $errors;
    }

    /** @param array<string, list<array<string, string>>> $rows
     * @return list<string>
     */
    private function existingConflicts(array $rows): array
    {
        $checks = [
            ['warehouses.csv', 'code', Warehouse::query(), 'code'],
            ['products.csv', 'sku', Product::query(), 'sku'],
            ['vehicles.csv', 'vehicle_number', Vehicle::query(), 'vehicle_number'],
            ['customers.csv', 'code', Customer::query(), 'code'],
            ['representatives.csv', 'code', SalesRepresentative::query(), 'code'],
            ['representatives.csv', 'username', User::query(), 'username'],
            ['office-users.csv', 'username', User::query(), 'username'],
        ];
        $errors = [];
        foreach ($checks as [$filename, $column, $query, $databaseColumn]) {
            $values = collect($rows[$filename])->pluck($column)->filter()->all();
            $conflicts = $query->whereIn($databaseColumn, $values)->pluck($databaseColumn);
            foreach ($conflicts as $value) {
                $errors[] = "{$filename}: {$column} {$value} already exists; use --allow-existing only for a controlled re-validation.";
            }
        }

        return $errors;
    }
}
