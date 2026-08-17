<?php

namespace Tests\Feature;

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Models\AuditLog;
use App\Models\CashSubmission;
use App\Models\Customer;
use App\Models\CustomerCreditBalance;
use App\Models\Product;
use App\Models\RepresentativeCashBalance;
use App\Models\RepresentativeInventory;
use App\Models\RepresentativeTransfer;
use App\Models\Sale;
use App\Models\SalesRepresentative;
use App\Models\StockMovement;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseInventory;
use App\Models\WarehouseTransfer;
use Database\Seeders\AccessControlSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase7ReportingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(AccessControlSeeder::class);
    }

    public function test_admin_dashboard_totals_posted_sales_and_current_balances_with_warehouse_scope(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::DashboardView);
        $this->actingAs($admin)->getJson('/api/admin/dashboard')->assertOk()
            ->assertJsonPath('kpis.warehouse_stock', 50)->assertJsonPath('kpis.active_representatives', 1)
            ->assertJsonPath('kpis.today_sales', 800)->assertJsonPath('kpis.today_cash_sales', 500)->assertJsonPath('kpis.today_credit_sales', 300)
            ->assertJsonPath('kpis.customer_outstanding', 300)->assertJsonPath('kpis.representative_cash', 500)
            ->assertJsonPath('kpis.pending_warehouse_transfers', 1)->assertJsonPath('kpis.pending_representative_receivings', 1)
            ->assertJsonCount(1, 'warehouses');
        $this->getJson('/api/admin/dashboard?warehouse_id='.$fixture['foreignWarehouse']->id)->assertForbidden();
    }

    public function test_representative_dashboard_uses_authenticated_owner_and_posted_today_only(): void
    {
        $fixture = $this->fixture();
        $this->actingAs($fixture['repUser'])->getJson('/api/sales/dashboard')->assertOk()
            ->assertJsonPath('representative.id', $fixture['representative']->id)->assertJsonPath('kpis.stock_units', 20)
            ->assertJsonPath('kpis.pending_receivings', 1)->assertJsonPath('kpis.today_sales', 800)
            ->assertJsonPath('kpis.today_cash_sales', 500)->assertJsonPath('kpis.today_credit_sales', 300)->assertJsonPath('kpis.cash_hold', 500)
            ->assertJsonCount(1, 'stock')->assertJsonCount(1, 'pending_receivings');
    }

    public function test_admin_reports_are_scoped_filterable_paginated_and_reconciled(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);
        $this->actingAs($admin)->getJson('/api/admin/reports/warehouse-stock?sort=quantity&direction=desc&per_page=10')->assertOk()->assertJsonPath('summary.units', 50)->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.warehouse.id', $fixture['warehouse']->id);
        $this->getJson('/api/admin/reports/representative-stock?per_page=10')->assertOk()->assertJsonPath('summary.units', 20)->assertJsonPath('summary.representatives', 1);
        $this->getJson('/api/admin/reports/stock-movements?movement_type=SALE_OUT&per_page=10')->assertOk()->assertJsonPath('summary.units', 8)->assertJsonPath('summary.movements', 2);
        $this->getJson('/api/admin/reports/cash-hold?per_page=10')->assertOk()->assertJsonPath('summary.cash_hold', 500)->assertJsonPath('data.0.representative.id', $fixture['representative']->id);
        $this->getJson('/api/admin/reports/customer-credit?per_page=10')->assertOk()->assertJsonPath('summary.outstanding', 300)->assertJsonPath('data.0.available_credit', 1700);
    }

    public function test_sales_report_includes_documents_but_totals_only_posted_and_supports_product_filter(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);
        $this->actingAs($admin)->getJson('/api/admin/reports/sales?per_page=10')->assertOk()->assertJsonPath('meta.total', 4)
            ->assertJsonPath('summary.gross_sales', 800)->assertJsonPath('summary.cash_sales', 500)->assertJsonPath('summary.credit_sales', 300)->assertJsonPath('summary.units_sold', 8)
            ->assertJsonPath('rules.financial_totals', 'posted_only');
        $this->getJson('/api/admin/reports/sales?product_id='.$fixture['product']->id.'&payment_type=cash&per_page=10')->assertOk()->assertJsonPath('meta.total', 3)->assertJsonPath('summary.gross_sales', 500);
    }

    public function test_representative_sales_report_is_own_only_and_supports_today_customer_product_and_payment_filters(): void
    {
        $fixture = $this->fixture();
        $this->actingAs($fixture['repUser'])->getJson('/api/sales/reports/sales?period=today&customer_id='.$fixture['customer']->id.'&product_id='.$fixture['product']->id.'&payment_type=credit&per_page=10')->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.reference', 'P7-CREDIT')->assertJsonPath('summary.gross_sales', 300);
        $this->getJson('/api/sales/report-options')->assertOk()->assertJsonCount(1, 'customers')->assertJsonCount(1, 'products');
    }

    public function test_audit_log_is_searchable_linked_and_warehouse_scoped(): void
    {
        $fixture = $this->fixture();
        AuditLog::query()->create(['actor_id' => $fixture['repUser']->id, 'event' => 'customer.updated', 'subject_type' => Customer::class, 'subject_id' => $fixture['customer']->id, 'metadata' => ['old' => ['name' => 'Old'], 'new' => ['name' => $fixture['customer']->name]], 'created_at' => now()]);
        AuditLog::query()->create(['actor_id' => $fixture['foreignRepUser']->id, 'event' => 'customer.updated', 'subject_type' => Customer::class, 'subject_id' => $fixture['foreignCustomer']->id, 'metadata' => ['new' => ['name' => 'Foreign']], 'created_at' => now()]);
        $admin = $this->office($fixture['warehouse'], PermissionName::AuditView);
        $this->actingAs($admin)->getJson('/api/admin/audit-logs?module=customer&search='.$fixture['repUser']->name.'&per_page=10')->assertOk()->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.actor.id', $fixture['repUser']->id)->assertJsonPath('data.0.module', 'customer')->assertJsonPath('data.0.subject_type', 'Customer')
            ->assertJsonPath('data.0.subject_url', '/admin/customers')->assertJsonPath('data.0.old.name', 'Old')->assertJsonPath('data.0.new.name', $fixture['customer']->name)
            ->assertJsonCount(1, 'filters.actors')->assertJsonPath('filters.actors.0.id', $fixture['repUser']->id);
    }

    public function test_warehouse_stock_report_query_count_stays_bounded_at_realistic_page_size(): void
    {
        $fixture = $this->fixture();
        foreach (range(1, 35) as $number) {
            $product = Product::factory()->create(['sku' => "P7-Q-{$number}"]);
            WarehouseInventory::query()->create(['warehouse_id' => $fixture['warehouse']->id, 'product_id' => $product->id, 'quantity' => $number]);
        }
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);
        DB::flushQueryLog();
        DB::enableQueryLog();
        $this->actingAs($admin)->getJson('/api/admin/reports/warehouse-stock?per_page=25')->assertOk()->assertJsonPath('meta.total', 36);
        $this->assertLessThanOrEqual(10, count(DB::getQueryLog()));
    }

    /** @return array<string, mixed> */
    private function fixture(): array
    {
        $warehouse = Warehouse::factory()->create(['code' => 'P7-WH']);
        $foreignWarehouse = Warehouse::factory()->create(['code' => 'P7-FWH']);
        $repUser = User::factory()->create(['name' => 'Phase Seven Rep']);
        $repUser->assignRole(RoleName::SalesRepresentative->value);
        $representative = SalesRepresentative::factory()->create(['user_id' => $repUser->id, 'primary_warehouse_id' => $warehouse->id, 'name' => 'Phase Seven Rep']);
        $foreignRepUser = User::factory()->create(['name' => 'Foreign Rep']);
        $foreignRepUser->assignRole(RoleName::SalesRepresentative->value);
        $foreignRepresentative = SalesRepresentative::factory()->create(['user_id' => $foreignRepUser->id, 'primary_warehouse_id' => $foreignWarehouse->id]);
        $customer = Customer::factory()->create(['warehouse_id' => $warehouse->id, 'credit_limit' => 2000]);
        $foreignCustomer = Customer::factory()->create(['warehouse_id' => $foreignWarehouse->id]);
        $product = Product::factory()->create(['sku' => 'P7-P']);
        $foreignProduct = Product::factory()->create(['sku' => 'P7-FP']);
        WarehouseInventory::query()->create(['warehouse_id' => $warehouse->id, 'product_id' => $product->id, 'quantity' => 50]);
        WarehouseInventory::query()->create(['warehouse_id' => $foreignWarehouse->id, 'product_id' => $foreignProduct->id, 'quantity' => 99]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $representative->id, 'product_id' => $product->id, 'quantity' => 20]);
        RepresentativeInventory::query()->create(['sales_representative_id' => $foreignRepresentative->id, 'product_id' => $foreignProduct->id, 'quantity' => 30]);
        RepresentativeCashBalance::query()->create(['sales_representative_id' => $representative->id, 'amount' => 500]);
        RepresentativeCashBalance::query()->create(['sales_representative_id' => $foreignRepresentative->id, 'amount' => 900]);
        CustomerCreditBalance::query()->create(['customer_id' => $customer->id, 'outstanding_amount' => 300]);
        CustomerCreditBalance::query()->create(['customer_id' => $foreignCustomer->id, 'outstanding_amount' => 700]);
        foreach ([['P7-CASH', 'cash', 500, 5, 'posted'], ['P7-CREDIT', 'credit', 300, 3, 'posted'], ['P7-DRAFT', 'cash', 200, 2, 'draft'], ['P7-VOID', 'cash', 150, 1, 'voided']] as [$reference, $payment, $amount, $quantity, $status]) {
            $sale = Sale::query()->create(['reference' => $reference, 'sales_representative_id' => $representative->id, 'warehouse_id' => $warehouse->id, 'customer_id' => $customer->id, 'payment_type' => $payment, 'total_amount' => $amount, 'status' => $status, 'created_by' => $repUser->id, 'posted_by' => $status === 'posted' ? $repUser->id : null, 'posted_at' => $status === 'posted' ? now() : null, 'voided_by' => $status === 'voided' ? $repUser->id : null, 'voided_at' => $status === 'voided' ? now() : null]);
            $sale->items()->create(['product_id' => $product->id, 'quantity' => $quantity, 'unit_price' => 100, 'line_total' => $quantity * 100]);
            if ($status === 'posted') {
                StockMovement::query()->create(['product_id' => $product->id, 'movement_type' => 'SALE_OUT', 'source_type' => 'sale', 'source_id' => $sale->id, 'reference' => $reference, 'from_location_type' => 'representative', 'from_location_id' => $representative->id, 'to_location_type' => 'customer', 'to_location_id' => $customer->id, 'quantity' => $quantity, 'created_by' => $repUser->id, 'occurred_at' => now()]);
            }
        }
        WarehouseTransfer::query()->create(['reference' => 'P7-WTR', 'source_warehouse_id' => $warehouse->id, 'destination_warehouse_id' => $foreignWarehouse->id, 'status' => 'dispatched', 'created_by' => $repUser->id, 'dispatched_by' => $repUser->id, 'dispatched_at' => now()]);
        $representativeTransfer = RepresentativeTransfer::query()->create(['reference' => 'P7-RTR', 'source_warehouse_id' => $warehouse->id, 'sales_representative_id' => $representative->id, 'status' => 'dispatched', 'created_by' => $repUser->id, 'dispatched_by' => $repUser->id, 'dispatched_at' => now()]);
        $representativeTransfer->items()->create(['product_id' => $product->id, 'quantity' => 10]);
        CashSubmission::query()->create(['reference' => 'P7-CSB', 'sales_representative_id' => $representative->id, 'warehouse_id' => $warehouse->id, 'amount' => 100, 'status' => 'pending', 'created_by' => $repUser->id]);

        return compact('warehouse', 'foreignWarehouse', 'repUser', 'representative', 'foreignRepUser', 'foreignRepresentative', 'customer', 'foreignCustomer', 'product');
    }

    private function office(Warehouse $warehouse, PermissionName ...$permissions): User
    {
        $user = User::factory()->create();
        $user->givePermissionTo(collect($permissions)->map->value->all());
        $user->warehouses()->attach($warehouse, ['assigned_by' => $user->id]);

        return $user;
    }
}
