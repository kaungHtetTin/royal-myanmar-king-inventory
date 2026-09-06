<?php

use App\Enums\PermissionName;
use App\Enums\RoleName;
use App\Http\Controllers\Admin\AccessOptionController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Admin\CashController as AdminCashController;
use App\Http\Controllers\Admin\CustomerController;
use App\Http\Controllers\Admin\CustomerPaymentController;
use App\Http\Controllers\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Admin\InventoryController;
use App\Http\Controllers\Admin\ProductController;
use App\Http\Controllers\Admin\RegionController;
use App\Http\Controllers\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Admin\RepresentativeInventoryController;
use App\Http\Controllers\Admin\RepresentativeReturnController;
use App\Http\Controllers\Admin\RepresentativeTransferController;
use App\Http\Controllers\Admin\RoleController;
use App\Http\Controllers\Admin\SaleController as AdminSaleController;
use App\Http\Controllers\Admin\SalesRepresentativeController as AdminSalesRepresentativeController;
use App\Http\Controllers\Admin\SettingController;
use App\Http\Controllers\Admin\StockAdjustmentController;
use App\Http\Controllers\Admin\StockImportController;
use App\Http\Controllers\Admin\TransferOptionController;
use App\Http\Controllers\Admin\TripController as AdminTripController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\Admin\VehicleController;
use App\Http\Controllers\Admin\WarehouseController;
use App\Http\Controllers\Admin\WarehouseTransferController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\BrandingController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\Sales\CashController as SalesCashController;
use App\Http\Controllers\Sales\CreditCollectionController;
use App\Http\Controllers\Sales\CustomerController as SalesCustomerController;
use App\Http\Controllers\Sales\DashboardController as SalesDashboardController;
use App\Http\Controllers\Sales\RepresentativeStockController;
use App\Http\Controllers\Sales\SaleController as SalesSaleController;
use App\Http\Controllers\Sales\TripController as SalesTripController;
use App\Http\Controllers\SalesRepresentativeController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class)->name('api.health');
Route::get('/branding', [BrandingController::class, 'show'])->name('api.branding');
Route::get('/branding/assets/{asset}', [BrandingController::class, 'asset'])->whereIn('asset', ['logo', 'favicon']);

Route::prefix('auth')->group(function (): void {
    Route::post('/login', [SessionController::class, 'store']);

    Route::middleware(['auth:sanctum', 'active'])->group(function (): void {
        Route::get('/user', [SessionController::class, 'show']);
        Route::post('/logout', [SessionController::class, 'destroy']);
    });
});

Route::middleware(['auth:sanctum', 'active'])->group(function (): void {
    Route::prefix('admin')->middleware('role:'.RoleName::SuperAdmin->value.'|'.RoleName::OfficeAdmin->value)->group(function (): void {
        Route::get('/me', [SessionController::class, 'show'])
            ->middleware('permission:'.PermissionName::DashboardView->value);
        Route::get('/dashboard', AdminDashboardController::class)->middleware('permission:'.PermissionName::DashboardView->value);
        Route::get('/representatives/{salesRepresentative}', [AdminSalesRepresentativeController::class, 'show'])
            ->middleware('permission:'.PermissionName::RepresentativeView->value);

        Route::get('/representatives', [AdminSalesRepresentativeController::class, 'index'])
            ->middleware('permission:'.PermissionName::RepresentativeView->value);
        Route::get('/representative-options', [AdminSalesRepresentativeController::class, 'options'])
            ->middleware('permission:'.PermissionName::RepresentativeView->value);
        Route::post('/representatives', [AdminSalesRepresentativeController::class, 'store'])
            ->middleware('permission:'.PermissionName::RepresentativeCreate->value);
        Route::put('/representatives/{salesRepresentative}', [AdminSalesRepresentativeController::class, 'update'])
            ->middleware('permission:'.PermissionName::RepresentativeEdit->value);

        Route::get('/warehouses', [WarehouseController::class, 'index'])
            ->middleware('permission:'.PermissionName::WarehouseView->value);
        Route::get('/warehouses/{warehouse}', [WarehouseController::class, 'show'])
            ->middleware('permission:'.PermissionName::WarehouseView->value);
        Route::post('/warehouses', [WarehouseController::class, 'store'])
            ->middleware('permission:'.PermissionName::WarehouseCreate->value);
        Route::put('/warehouses/{warehouse}', [WarehouseController::class, 'update'])
            ->middleware('permission:'.PermissionName::WarehouseEdit->value);
        Route::post('/warehouses/{warehouse}/regions', [RegionController::class, 'store'])
            ->middleware('permission:'.PermissionName::WarehouseEdit->value);
        Route::put('/regions/{region}', [RegionController::class, 'update'])
            ->middleware('permission:'.PermissionName::WarehouseEdit->value);
        Route::get('/products', [ProductController::class, 'index'])
            ->middleware('permission:'.PermissionName::ProductView->value);
        Route::get('/products/{product}', [ProductController::class, 'show'])
            ->middleware('permission:'.PermissionName::ProductView->value);
        Route::get('/product-options', [ProductController::class, 'options'])
            ->middleware('permission:'.PermissionName::ProductView->value);
        Route::post('/products', [ProductController::class, 'store'])
            ->middleware('permission:'.PermissionName::ProductCreate->value);
        Route::put('/products/{product}', [ProductController::class, 'update'])
            ->middleware('permission:'.PermissionName::ProductEdit->value);

        Route::get('/vehicles', [VehicleController::class, 'index'])
            ->middleware('permission:'.PermissionName::VehicleView->value);
        Route::get('/vehicles/{vehicle}', [VehicleController::class, 'show'])->middleware('permission:'.PermissionName::VehicleView->value);
        Route::get('/vehicles/{vehicle}/assignment', [\App\Http\Controllers\Admin\VehicleAssignmentController::class, 'vehicleOptions'])->middleware('permission:'.PermissionName::VehicleEdit->value);
        Route::put('/vehicles/{vehicle}/assignment', [\App\Http\Controllers\Admin\VehicleAssignmentController::class, 'vehicle'])->middleware('permission:'.PermissionName::VehicleEdit->value);
        Route::get('/representatives/{salesRepresentative}/assignment', [\App\Http\Controllers\Admin\VehicleAssignmentController::class, 'representativeOptions'])->middleware('permission:'.PermissionName::RepresentativeEdit->value);
        Route::put('/representatives/{salesRepresentative}/assignment', [\App\Http\Controllers\Admin\VehicleAssignmentController::class, 'representative'])->middleware('permission:'.PermissionName::RepresentativeEdit->value);
        Route::get('/vehicle-options', [VehicleController::class, 'options'])
            ->middleware('permission:'.PermissionName::VehicleView->value);
        Route::post('/vehicles', [VehicleController::class, 'store'])
            ->middleware('permission:'.PermissionName::VehicleCreate->value);
        Route::put('/vehicles/{vehicle}', [VehicleController::class, 'update'])
            ->middleware('permission:'.PermissionName::VehicleEdit->value);

        Route::get('/customers', [CustomerController::class, 'index'])
            ->middleware('permission:'.PermissionName::CustomerView->value);
        Route::get('/customers/{customer}', [CustomerController::class, 'show'])
            ->middleware('permission:'.PermissionName::CustomerView->value);
        Route::get('/customers/{customer}/sale-report', [CustomerController::class, 'saleReport'])
            ->middleware(['permission:'.PermissionName::CustomerView->value, 'permission:'.PermissionName::SaleView->value]);
        Route::get('/customer-options', [CustomerController::class, 'options'])
            ->middleware('permission:'.PermissionName::CustomerView->value);
        Route::post('/customers', [CustomerController::class, 'store'])
            ->middleware('permission:'.PermissionName::CustomerCreate->value);
        Route::put('/customers/{customer}', [CustomerController::class, 'update'])
            ->middleware('permission:'.PermissionName::CustomerEdit->value);
        Route::put('/customers/{customer}/credit', [CustomerController::class, 'updateCredit'])
            ->middleware('permission:'.PermissionName::CustomerCreditManage->value);

        Route::middleware('permission:'.PermissionName::InventoryView->value)->group(function (): void {
            Route::get('/inventory', [InventoryController::class, 'index']);
            Route::get('/inventory/export', [InventoryController::class, 'export']);
            Route::get('/inventory/options', [InventoryController::class, 'options']);
            Route::get('/inventory/movements', [InventoryController::class, 'movements']);
            Route::get('/stock-imports', [StockImportController::class, 'index']);
            Route::get('/stock-imports/{stockImport}', [StockImportController::class, 'show']);
            Route::get('/stock-adjustments', [StockAdjustmentController::class, 'index']);
        });

        Route::middleware('permission:'.PermissionName::InventoryImport->value)->group(function (): void {
            Route::post('/stock-imports', [StockImportController::class, 'store']);
            Route::put('/stock-imports/{stockImport}', [StockImportController::class, 'update']);
            Route::post('/stock-imports/{stockImport}/post', [StockImportController::class, 'post']);
            Route::post('/stock-imports/{stockImport}/void', [StockImportController::class, 'void']);
        });

        Route::middleware('permission:'.PermissionName::InventoryAdjust->value)->group(function (): void {
            Route::post('/stock-adjustments', [StockAdjustmentController::class, 'store']);
            Route::put('/stock-adjustments/{stockAdjustment}', [StockAdjustmentController::class, 'update']);
            Route::post('/stock-adjustments/{stockAdjustment}/post', [StockAdjustmentController::class, 'post']);
        });

        Route::middleware('permission:'.PermissionName::WarehouseTransferView->value)->group(function (): void {
            Route::get('/warehouse-transfers', [WarehouseTransferController::class, 'index']);
            Route::get('/warehouse-transfers/{warehouseTransfer}', [WarehouseTransferController::class, 'show']);
            Route::get('/warehouse-transfer-options', [TransferOptionController::class, 'warehouses']);
        });
        Route::middleware('permission:'.PermissionName::WarehouseTransferCreate->value)->group(function (): void {
            Route::post('/warehouse-transfers', [WarehouseTransferController::class, 'store']);
            Route::put('/warehouse-transfers/{warehouseTransfer}', [WarehouseTransferController::class, 'update']);
            Route::post('/warehouse-transfers/{warehouseTransfer}/cancel', [WarehouseTransferController::class, 'cancel']);
        });
        Route::post('/warehouse-transfers/{warehouseTransfer}/dispatch', [WarehouseTransferController::class, 'dispatch'])
            ->middleware('permission:'.PermissionName::WarehouseTransferDispatch->value);
        Route::post('/warehouse-transfers/{warehouseTransfer}/receive', [WarehouseTransferController::class, 'receive'])
            ->middleware('permission:'.PermissionName::WarehouseTransferReceive->value);
        Route::post('/warehouse-transfers/{warehouseTransfer}/reverse', [WarehouseTransferController::class, 'reverse'])
            ->middleware('permission:'.PermissionName::WarehouseTransferReverse->value);

        Route::middleware('permission:'.PermissionName::RepresentativeStockView->value)->group(function (): void {
            Route::get('/representative-inventory', [RepresentativeInventoryController::class, 'index']);
            Route::get('/representative-transfers', [RepresentativeTransferController::class, 'index']);
            Route::get('/representative-transfers/{representativeTransfer}', [RepresentativeTransferController::class, 'show']);
            Route::get('/representative-transfer-options', [TransferOptionController::class, 'representatives']);
            Route::get('/representative-return-options', [TransferOptionController::class, 'representativeReturns']);
            Route::get('/representative-returns', [RepresentativeReturnController::class, 'index']);
            Route::get('/representative-returns/{representativeReturn}', [RepresentativeReturnController::class, 'show']);
        });
        Route::middleware('permission:'.PermissionName::RepresentativeStockIssue->value)->group(function (): void {
            Route::post('/representative-transfers', [RepresentativeTransferController::class, 'store']);
            Route::put('/representative-transfers/{representativeTransfer}', [RepresentativeTransferController::class, 'update']);
            Route::post('/representative-transfers/{representativeTransfer}/dispatch', [RepresentativeTransferController::class, 'dispatch']);
            Route::post('/representative-transfers/{representativeTransfer}/cancel', [RepresentativeTransferController::class, 'cancel']);
            Route::post('/representative-transfers/{representativeTransfer}/reverse', [RepresentativeTransferController::class, 'reverse']);
            Route::post('/representative-returns', [RepresentativeReturnController::class, 'store']);
            Route::put('/representative-returns/{representativeReturn}', [RepresentativeReturnController::class, 'update']);
            Route::post('/representative-returns/{representativeReturn}/post', [RepresentativeReturnController::class, 'post']);
            Route::post('/representative-returns/{representativeReturn}/cancel', [RepresentativeReturnController::class, 'cancel']);
            Route::post('/representative-returns/{representativeReturn}/reverse', [RepresentativeReturnController::class, 'reverse']);
        });

        Route::get('/sales', [AdminSaleController::class, 'index'])->middleware('permission:'.PermissionName::SaleView->value);
        Route::get('/sales/{sale}', [AdminSaleController::class, 'show'])->middleware('permission:'.PermissionName::SaleView->value);
        Route::post('/sales/{sale}/void', [AdminSaleController::class, 'void'])->middleware('permission:'.PermissionName::SaleVoid->value);

        Route::middleware('permission:'.PermissionName::TripView->value)->group(function (): void {
            Route::get('/trips', [AdminTripController::class, 'index']);
            Route::get('/trip-options', [AdminTripController::class, 'options']);
            Route::get('/trips/{trip}', [AdminTripController::class, 'show']);
        });
        Route::middleware('permission:'.PermissionName::TripManage->value)->group(function (): void {
            Route::post('/trips', [AdminTripController::class, 'store']);
            Route::post('/trips/{trip}/start', [AdminTripController::class, 'start']);
            Route::post('/trips/{trip}/begin-ending', [AdminTripController::class, 'beginEnding']);
            Route::post('/trips/{trip}/cancel', [AdminTripController::class, 'cancel']);
        });
        Route::post('/trips/{trip}/complete', [AdminTripController::class, 'complete'])->middleware('permission:'.PermissionName::TripClose->value);

        Route::middleware('permission:'.PermissionName::CashView->value)->group(function (): void {
            Route::get('/cash-balances', [AdminCashController::class, 'balances']);
            Route::get('/cash-submissions', [AdminCashController::class, 'submissions']);
        });
        Route::post('/cash-submissions/{cashSubmission}/confirm', [AdminCashController::class, 'confirm'])->middleware('permission:'.PermissionName::CashConfirm->value);
        Route::post('/cash-submissions', [AdminCashController::class, 'store'])->middleware('permission:'.PermissionName::CashConfirm->value);
        Route::post('/cash-submissions/{cashSubmission}/reverse', [AdminCashController::class, 'reverse'])->middleware('permission:'.PermissionName::CashReverse->value);

        Route::middleware('permission:'.PermissionName::CustomerPaymentView->value)->group(function (): void {
            Route::get('/customer-credit-balances', [CustomerPaymentController::class, 'balances']);
            Route::get('/customer-payment-options', [CustomerPaymentController::class, 'options']);
            Route::get('/customer-payments', [CustomerPaymentController::class, 'index']);
        });
        Route::middleware('permission:'.PermissionName::CustomerPaymentCreate->value)->group(function (): void {
            Route::post('/customer-payments', [CustomerPaymentController::class, 'store']);
            Route::put('/customer-payments/{customerPayment}', [CustomerPaymentController::class, 'update']);
            Route::post('/customer-payments/{customerPayment}/post', [CustomerPaymentController::class, 'post']);
        });
        Route::post('/customer-payments/{customerPayment}/void', [CustomerPaymentController::class, 'void'])->middleware('permission:'.PermissionName::CustomerPaymentVoid->value);

        Route::middleware('permission:'.PermissionName::ReportView->value)->group(function (): void {
            Route::get('/report-options', [AdminReportController::class, 'options']);
            Route::get('/reports/{report}', [AdminReportController::class, 'show']);
        });
        Route::get('/audit-logs', AuditLogController::class)->middleware('permission:'.PermissionName::AuditView->value);

        Route::get('/access-options', AccessOptionController::class)->middleware(
            'permission:'.PermissionName::UserManage->value.'|'.PermissionName::RoleManage->value,
        );

        Route::middleware('permission:'.PermissionName::UserManage->value)->group(function (): void {
            Route::get('/users', [UserController::class, 'index']);
            Route::post('/users', [UserController::class, 'store']);
            Route::put('/users/{user}', [UserController::class, 'update']);
            Route::put('/users/{user}/access', [UserController::class, 'updateAccess']);
        });

        Route::middleware('permission:'.PermissionName::RoleManage->value)->group(function (): void {
            Route::get('/roles', [RoleController::class, 'index']);
            Route::post('/roles', [RoleController::class, 'store']);
            Route::put('/roles/{role}', [RoleController::class, 'update']);
            Route::get('/settings', [SettingController::class, 'show']);
            Route::post('/settings', [SettingController::class, 'update']);
            Route::put('/settings/profile', [SettingController::class, 'updateProfile']);
        });
    });

    Route::prefix('sales')->group(function (): void {
        Route::get('/me', [SessionController::class, 'show'])
            ->middleware(['role:'.RoleName::SalesRepresentative->value, 'active_representative']);
        Route::middleware(['role:'.RoleName::SalesRepresentative->value, 'active_representative'])->group(function (): void {
            Route::get('/profile', [SalesRepresentativeController::class, 'current']);
            Route::put('/profile', [SalesRepresentativeController::class, 'update']);
            Route::put('/profile/password', [SalesRepresentativeController::class, 'updatePassword']);
            Route::get('/dashboard', SalesDashboardController::class)->middleware('permission:'.PermissionName::DashboardView->value.'|'.PermissionName::ReportView->value);
            Route::get('/representatives/{salesRepresentative}', [SalesRepresentativeController::class, 'show']);
            Route::get('/stock', [RepresentativeStockController::class, 'index'])
                ->middleware('permission:'.PermissionName::RepresentativeStockView->value);
            Route::get('/receivings', [RepresentativeStockController::class, 'pending'])
                ->middleware('permission:'.PermissionName::RepresentativeStockReceive->value);
            Route::get('/receiving-history', [RepresentativeStockController::class, 'history'])
                ->middleware('permission:'.PermissionName::RepresentativeStockReceive->value);
            Route::get('/receivings/{representativeTransfer}', [RepresentativeStockController::class, 'show'])
                ->middleware('permission:'.PermissionName::RepresentativeStockReceive->value);
            Route::post('/receivings/{representativeTransfer}/receive', [RepresentativeStockController::class, 'receive'])
                ->middleware('permission:'.PermissionName::RepresentativeStockReceive->value);
            Route::get('/sales', [SalesSaleController::class, 'index'])->middleware('permission:'.PermissionName::SaleView->value);
            Route::get('/sale-history-options', [SalesSaleController::class, 'historyOptions'])->middleware('permission:'.PermissionName::SaleView->value);
            Route::get('/sales/{sale}', [SalesSaleController::class, 'show'])->middleware('permission:'.PermissionName::SaleView->value);
            Route::get('/sale-options', [SalesSaleController::class, 'options'])->middleware('permission:'.PermissionName::SaleCreate->value);
            Route::middleware('permission:'.PermissionName::SaleCreate->value)->group(function (): void {
                Route::get('/customer-options', [SalesCustomerController::class, 'options']);
                Route::get('/customers', [SalesCustomerController::class, 'index']);
                Route::post('/customers', [SalesCustomerController::class, 'store']);
                Route::post('/credit-collections', [CreditCollectionController::class, 'store']);
                Route::post('/sales', [SalesSaleController::class, 'store']);
                Route::put('/sales/{sale}', [SalesSaleController::class, 'update']);
                Route::delete('/sales/{sale}', [SalesSaleController::class, 'destroy']);
                Route::post('/sales/{sale}/post', [SalesSaleController::class, 'post']);
            });
            Route::middleware('permission:'.PermissionName::TripView->value)->group(function (): void {
                Route::get('/current-trip', [SalesTripController::class, 'current']);
                Route::post('/trips/{trip}/begin-ending', [SalesTripController::class, 'beginEnding']);
            });
            Route::post('/trips/{trip}/expenses', [SalesTripController::class, 'expense'])->middleware('permission:'.PermissionName::TripExpenseCreate->value);
            Route::get('/cash-hold', [SalesCashController::class, 'overview'])->middleware('permission:'.PermissionName::CashView->value);
            Route::get('/cash-submissions', [SalesCashController::class, 'index'])->middleware('permission:'.PermissionName::CashView->value);
            Route::get('/cash-transactions', [SalesCashController::class, 'transactions'])->middleware('permission:'.PermissionName::CashView->value);
            Route::middleware('permission:'.PermissionName::CashSubmit->value)->group(function (): void {
                Route::post('/cash-submissions', [SalesCashController::class, 'store']);
                Route::post('/cash-submissions/{cashSubmission}/cancel', [SalesCashController::class, 'cancel']);
            });
        });
    });
});
