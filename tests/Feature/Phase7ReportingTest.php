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
            ->assertJsonCount(1, 'stock')->assertJsonCount(1, 'pending_receivings')->assertJsonCount(4, 'recent_sales')
            ->assertJsonPath('recent_sales.0.reference', 'P7-VOID');
    }

    public function test_admin_representative_detail_combines_scoped_kpis_and_daily_sales_chart(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office(
            $fixture['warehouse'],
            PermissionName::RepresentativeView,
            PermissionName::RepresentativeStockView,
            PermissionName::SaleView,
            PermissionName::CashView,
        );

        $this->actingAs($admin)->getJson('/api/admin/representatives/'.$fixture['representative']->id)
            ->assertOk()
            ->assertJsonPath('representative.id', $fixture['representative']->id)
            ->assertJsonPath('visibility.stock', true)
            ->assertJsonPath('visibility.sales', true)
            ->assertJsonPath('visibility.cash', true)
            ->assertJsonPath('kpis.stock_units', 20)
            ->assertJsonPath('kpis.stock_products', 1)
            ->assertJsonPath('kpis.sales_30_days', 800)
            ->assertJsonPath('kpis.sales_transactions_30_days', 2)
            ->assertJsonPath('kpis.cash_hold', 500)
            ->assertJsonPath('kpis.pending_submissions', 100)
            ->assertJsonPath('kpis.pending_submission_count', 1)
            ->assertJsonCount(30, 'sales_chart')
            ->assertJsonPath('sales_chart.29.amount', 800);

        $this->getJson('/api/admin/representatives/'.$fixture['foreignRepresentative']->id)->assertForbidden();
    }

    public function test_admin_reports_are_scoped_filterable_paginated_and_reconciled(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);
        $this->actingAs($admin)->getJson('/api/admin/report-options')->assertOk()->assertJsonPath('reports', ['sales', 'representatives', 'customers']);
        foreach (['way-sales-power', 'stock-issues', 'warehouse-stock', 'representative-stock', 'stock-movements', 'warehouse-transfers', 'representative-transfers', 'cash-hold', 'customer-credit'] as $removedReport) {
            $this->getJson('/api/admin/reports/'.$removedReport.'?per_page=10')->assertNotFound();
        }
    }

    public function test_sales_report_includes_documents_but_totals_only_posted(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);
        $todayIndex = today()->day - 1;
        $this->actingAs($admin)->getJson('/api/admin/reports/sales?per_page=10')->assertOk()->assertJsonPath('meta.total', 4)
            ->assertJsonPath('summary.month_sales', 800)->assertJsonPath('summary.year_sales', 800)
            ->assertJsonPath('summary.gross_sales', 800)->assertJsonPath('summary.cash_sales', 500)->assertJsonPath('summary.credit_sales', 300)->assertJsonPath('summary.units_sold', 8)
            ->assertJsonCount(today()->daysInMonth, 'analysis.month_trend')->assertJsonPath("analysis.month_trend.{$todayIndex}.amount", 800)
            ->assertJsonCount(12, 'analysis.year_trend')->assertJsonPath('analysis.year_trend.'.(today()->month - 1).'.amount', 800)
            ->assertJsonCount(1, 'analysis.top_products')->assertJsonPath('analysis.top_products.0.product.id', $fixture['product']->id)->assertJsonPath('analysis.top_products.0.units', 8)
            ->assertJsonPath('rules.financial_totals', 'posted_only');
    }

    public function test_representative_and_customer_analysis_apply_amount_duration_and_scope(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);

        $this->actingAs($admin)->getJson('/api/admin/reports/representatives?min_amount=700&per_page=10')->assertOk()
            ->assertJsonPath('report', 'representatives')->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.representative.id', $fixture['representative']->id)
            ->assertJsonPath('data.0.sales_amount', 800)->assertJsonPath('data.0.sale_count', 2);
        $this->getJson('/api/admin/reports/representatives?min_amount=900&per_page=10')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/admin/reports/customers?date_from='.today()->toDateString().'&min_amount=700&per_page=10')->assertOk()
            ->assertJsonPath('report', 'customers')->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.customer.id', $fixture['customer']->id)
            ->assertJsonPath('data.0.purchase_amount', 800)->assertJsonPath('data.0.purchase_count', 2);
    }

    public function test_representative_sales_report_is_own_only_and_supports_today_customer_product_and_payment_filters(): void
    {
        $fixture = $this->fixture();
        $this->actingAs($fixture['repUser'])->getJson('/api/sales/sales?period=today&customer_id='.$fixture['customer']->id.'&product_id='.$fixture['product']->id.'&payment_type=credit&per_page=10')->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.reference', 'P7-CREDIT')->assertJsonPath('summary.gross_sales', 300);
        $this->getJson('/api/sales/sale-history-options')->assertOk()->assertJsonCount(1, 'customers')->assertJsonCount(1, 'products');
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

    public function test_removed_warehouse_stock_report_is_not_available(): void
    {
        $fixture = $this->fixture();
        $admin = $this->office($fixture['warehouse'], PermissionName::ReportView);
        $this->actingAs($admin)->getJson('/api/admin/reports/warehouse-stock?per_page=25')->assertNotFound();
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
        $user->assignRole(RoleName::OfficeAdmin->value);
        $user->givePermissionTo(collect($permissions)->map->value->all());
        $user->warehouses()->attach($warehouse, ['assigned_by' => $user->id]);

        return $user;
    }
}
