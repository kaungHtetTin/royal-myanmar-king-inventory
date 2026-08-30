<?php

namespace Tests;

use App\Enums\TripStatus;
use App\Models\Customer;
use App\Models\Region;
use App\Models\RepresentativeTransfer;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected bool $useLegacyTripCompatibility = true;

    /**
     * Keep pre-trip feature tests focused on their original domain while ensuring
     * every new stock, sale, and cash record still belongs to a real trip.
     */
    public function postJson($uri, array $data = [], array $headers = [], $options = 0)
    {
        $path = parse_url((string) $uri, PHP_URL_PATH);
        if ($this->useLegacyTripCompatibility && $path === '/api/admin/representative-transfers' && isset($data['sales_representative_id'])) {
            $trip = $this->testTrip((int) $data['sales_representative_id'], TripStatus::Planning, (int) ($data['source_warehouse_id'] ?? 0));
            $data['trip_id'] ??= $trip->id;
        }
        if ($this->useLegacyTripCompatibility && $path === '/api/admin/representative-returns' && isset($data['sales_representative_id'])) {
            $trip = $this->testTrip((int) $data['sales_representative_id'], TripStatus::Ending, (int) ($data['target_warehouse_id'] ?? 0));
            $data['trip_id'] ??= $trip->id;
        }
        if ($this->useLegacyTripCompatibility && $path === '/api/sales/sales') {
            $representative = auth()->user()?->salesRepresentative;
            if ($representative) {
                $customer = isset($data['customer_id']) ? Customer::query()->find($data['customer_id']) : null;
                $tripRegionId = $customer && $representative->regions()->whereKey($customer->region_id)->exists() ? $customer->region_id : null;
                $this->testTrip($representative->id, TripStatus::Operation, $representative->primary_warehouse_id, $tripRegionId);
            }
        }
        if ($this->useLegacyTripCompatibility && $path === '/api/sales/customers') {
            $representative = auth()->user()?->salesRepresentative;
            if ($representative) {
                $this->testTrip($representative->id, TripStatus::Operation, $representative->primary_warehouse_id, isset($data['region_id']) ? (int) $data['region_id'] : null);
            }
        }
        if ($this->useLegacyTripCompatibility && $path === '/api/sales/cash-submissions') {
            $representative = auth()->user()?->salesRepresentative;
            if ($representative) {
                $this->testTrip($representative->id, TripStatus::Operation, $representative->primary_warehouse_id);
            }
        }

        return parent::postJson($uri, $data, $headers, $options);
    }

    public function putJson($uri, array $data = [], array $headers = [], $options = 0)
    {
        $path = parse_url((string) $uri, PHP_URL_PATH);
        if ($this->useLegacyTripCompatibility && preg_match('#^/api/admin/representative-transfers/(\d+)$#', (string) $path, $matches)) {
            $data['trip_id'] ??= RepresentativeTransfer::query()->find($matches[1])?->trip_id;
        }
        if ($this->useLegacyTripCompatibility && preg_match('#^/api/admin/representative-returns/(\d+)$#', (string) $path, $matches)) {
            $data['trip_id'] ??= RepresentativeTransfer::query()->find($matches[1])?->trip_id;
        }

        return parent::putJson($uri, $data, $headers, $options);
    }

    public function getJson($uri, array $headers = [], $options = 0)
    {
        $path = parse_url((string) $uri, PHP_URL_PATH);
        if ($this->useLegacyTripCompatibility && $path === '/api/sales/sale-options') {
            $representative = auth()->user()?->salesRepresentative;
            if ($representative) {
                $this->testTrip($representative->id, TripStatus::Operation, $representative->primary_warehouse_id);
            }
        }

        return parent::getJson($uri, $headers, $options);
    }

    private function test_trip(int $representativeId, TripStatus $status, int $warehouseId, ?int $regionId = null): Trip
    {
        $representative = SalesRepresentative::query()->findOrFail($representativeId);
        $warehouseId = $warehouseId ?: $representative->primary_warehouse_id;
        $region = $regionId ? Region::query()->find($regionId) : $representative->regions()->first();
        $region ??= Region::query()->firstOrCreate(['warehouse_id' => $warehouseId, 'name' => 'Test Region'], ['is_active' => true]);
        $representative->regions()->syncWithoutDetaching([$region->id]);
        $vehicle = Vehicle::query()->where('sales_representative_id', $representative->id)->first()
            ?? Vehicle::factory()->create(['sales_representative_id' => $representative->id, 'is_active' => true]);
        $trip = Trip::query()->where('sales_representative_id', $representative->id)
            ->whereIn('status', [TripStatus::Planning, TripStatus::Operation, TripStatus::Ending])->latest('id')->first();
        if (! $trip) {
            $trip = Trip::query()->create([
                'reference' => 'TST-'.str_pad((string) (Trip::query()->count() + 1), 8, '0', STR_PAD_LEFT),
                'title' => 'Test trip', 'warehouse_id' => $warehouseId, 'region_id' => $region->id,
                'sales_representative_id' => $representative->id, 'vehicle_id' => $vehicle->id,
                'status' => $status, 'created_by' => auth()->id() ?? $representative->user_id,
                'started_at' => $status === TripStatus::Operation ? now() : null,
                'ending_at' => $status === TripStatus::Ending ? now() : null,
            ]);
        } elseif ($trip->status !== $status) {
            $trip->update(['status' => $status, 'started_at' => $status === TripStatus::Operation ? now() : $trip->started_at, 'ending_at' => $status === TripStatus::Ending ? now() : $trip->ending_at]);
        }

        return $trip;
    }
}
