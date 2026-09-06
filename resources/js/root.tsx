import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedPortal } from './auth/protected-portal';
import { SessionProvider } from './auth/session';
import { BrandingProvider } from './branding/branding-provider';
import type { SessionUser } from './auth/session-context';
import { AdminShell } from './layouts/admin-shell';
import { SalesShell } from './layouts/sales-shell';
import { useLocale } from './localization/locale-context';
import { LocaleProvider } from './localization/locale-provider';
import { AdminFoundationPage } from './pages/admin/foundation-page';
import { SalesFoundationPage } from './pages/sales/foundation-page';
import { LoginPage } from './pages/auth/login-page';
import { AdminDashboardPage } from './pages/admin/dashboard-page';
import { RepresentativeDashboardPage } from './pages/sales/dashboard-page';

const AccessManagementPage = lazy(() =>
    import('./pages/admin/access-management-page').then((module) => ({
        default: module.AccessManagementPage,
    })),
);
const AuditLogPage = lazy(() =>
    import('./pages/admin/audit-log-page').then((module) => ({
        default: module.AuditLogPage,
    })),
);
const CustomerManagementPage = lazy(() =>
    import('./pages/admin/customer-management-page').then((module) => ({
        default: module.CustomerManagementPage,
    })),
);
const CustomerDetailPage = lazy(() =>
    import('./pages/admin/customer-detail-page').then((module) => ({
        default: module.CustomerDetailPage,
    })),
);
const FinanceManagementPage = lazy(() =>
    import('./pages/admin/finance-management-page').then((module) => ({
        default: module.FinanceManagementPage,
    })),
);
const InventoryManagementPage = lazy(() =>
    import('./pages/admin/inventory-management-page').then((module) => ({
        default: module.InventoryManagementPage,
    })),
);
const StockImportFormPage = lazy(() =>
    import('./pages/admin/inventory-management-page').then((module) => ({
        default: module.StockImportFormPage,
    })),
);
const StockImportDetailPage = lazy(() =>
    import('./pages/admin/stock-import-detail-page').then((module) => ({
        default: module.StockImportDetailPage,
    })),
);
const ProductManagementPage = lazy(() =>
    import('./pages/admin/product-management-page').then((module) => ({
        default: module.ProductManagementPage,
    })),
);
const ProductFormPage = lazy(() =>
    import('./pages/admin/product-management-page').then((module) => ({
        default: module.ProductFormPage,
    })),
);
const ReportsPage = lazy(() =>
    import('./pages/admin/reports-page').then((module) => ({
        default: module.ReportsPage,
    })),
);
const RepresentativeManagementPage = lazy(() =>
    import('./pages/admin/representative-management-page').then((module) => ({
        default: module.RepresentativeManagementPage,
    })),
);
const RepresentativeDetailPage = lazy(() =>
    import('./pages/admin/representative-detail-page').then((module) => ({
        default: module.RepresentativeDetailPage,
    })),
);
const SalesManagementPage = lazy(() =>
    import('./pages/admin/sales-management-page').then((module) => ({
        default: module.SalesManagementPage,
    })),
);
const AdminSaleDetailPage = lazy(() =>
    import('./pages/admin/sale-detail-page').then((module) => ({ default: module.AdminSaleDetailPage })),
);
const TransferManagementPage = lazy(() =>
    import('./pages/admin/transfer-management-page').then((module) => ({
        default: module.TransferManagementPage,
    })),
);
const TripManagementPage = lazy(() =>
    import('./pages/admin/trip-management-page').then((module) => ({ default: module.TripManagementPage })),
);
const TripDetailPage = lazy(() =>
    import('./pages/admin/trip-management-page').then((module) => ({ default: module.TripDetailPage })),
);
const WarehouseTransferFormPage = lazy(() =>
    import('./pages/admin/transfer-management-page').then((module) => ({
        default: module.WarehouseTransferFormPage,
    })),
);
const RepresentativeTransferFormPage = lazy(() =>
    import('./pages/admin/transfer-management-page').then((module) => ({
        default: module.RepresentativeTransferFormPage,
    })),
);
const RepresentativeReturnFormPage = lazy(() =>
    import('./pages/admin/representative-return-form-page').then((module) => ({
        default: module.RepresentativeReturnFormPage,
    })),
);
const TransferDetailPage = lazy(() =>
    import('./pages/admin/transfer-detail-page').then((module) => ({ default: module.TransferDetailPage })),
);
const VehicleManagementPage = lazy(() =>
    import('./pages/admin/vehicle-management-page').then((module) => ({
        default: module.VehicleManagementPage,
    })),
);
const VehicleDetailPage = lazy(() => import('./pages/admin/vehicle-detail-page').then((module) => ({ default: module.VehicleDetailPage })));
const WarehouseManagementPage = lazy(() =>
    import('./pages/admin/warehouse-management-page').then((module) => ({
        default: module.WarehouseManagementPage,
    })),
);
const WarehouseCoveragePage = lazy(() =>
    import('./pages/admin/warehouse-coverage-page').then((module) => ({
        default: module.WarehouseCoveragePage,
    })),
);
const SettingsPage = lazy(() =>
    import('./pages/admin/settings-page').then((module) => ({
        default: module.SettingsPage,
    })),
);
const CashWorkspacePage = lazy(() =>
    import('./pages/sales/cash-workspace-page').then((module) => ({
        default: module.CashWorkspacePage,
    })),
);
const CurrentTripPage = lazy(() =>
    import('./pages/sales/current-trip-page').then((module) => ({ default: module.CurrentTripPage })),
);
const RepresentativeStockPage = lazy(() =>
    import('./pages/sales/representative-stock-page').then((module) => ({
        default: module.RepresentativeStockPage,
    })),
);
const ReceivingDetailPage = lazy(() =>
    import('./pages/sales/receiving-detail-page').then((module) => ({ default: module.ReceivingDetailPage })),
);
const ProfileSettingsPage = lazy(() =>
    import('./pages/sales/profile-settings-page').then((module) => ({ default: module.ProfileSettingsPage })),
);
const SalesCustomerPage = lazy(() =>
    import('./pages/sales/customer-page').then((module) => ({ default: module.SalesCustomerPage })),
);
const NewSalesCustomerPage = lazy(() =>
    import('./pages/sales/customer-page').then((module) => ({ default: module.NewSalesCustomerPage })),
);
const NewSalePage = lazy(() =>
    import('./pages/sales/sales-workspace-page').then((module) => ({
        default: module.NewSalePage,
    })),
);
const SalesHistoryPage = lazy(() =>
    import('./pages/sales/sales-workspace-page').then((module) => ({
        default: module.SalesHistoryPage,
    })),
);
const SaleHistoryDetailPage = lazy(() =>
    import('./pages/sales/sale-history-detail-page').then((module) => ({
        default: module.SaleHistoryDetailPage,
    })),
);

function RouteLoading() {
    const { t } = useLocale();

    return (
        <div className="ui-loading" role="status">
            <span />
            {t('Loading workspace…')}
        </div>
    );
}

function RouteSuspense({ children }: { children: ReactNode }) {
    const location = useLocation();

    return (
        <Suspense key={location.pathname} fallback={<RouteLoading />}>
            {children}
        </Suspense>
    );
}

export default function Root({ initialUser }: { initialUser?: SessionUser | null }) {
    return (
        <LocaleProvider>
            <BrandingProvider>
                <SessionProvider initialUser={initialUser}>
                    <Routes>
                        <Route path="/admin/login" element={<LoginPage portal="admin" />} />
                        <Route path="/sales/login" element={<LoginPage portal="sales" />} />
                        <Route
                            path="/admin/*"
                            element={
                                <ProtectedPortal portal="admin">
                                    <AdminShell>
                                        <RouteSuspense>
                                            <Routes>
                                                <Route path="dashboard" element={<AdminDashboardPage />} />
                                                <Route path="reports" element={<ReportsPage />} />
                                                <Route path="audit-logs" element={<AuditLogPage />} />
                                                <Route path="inventory" element={<InventoryManagementPage />} />
                                                <Route path="inventory/imports/new" element={<StockImportFormPage />} />
                                                <Route
                                                    path="inventory/imports/:importId"
                                                    element={<StockImportDetailPage />}
                                                />
                                                <Route
                                                    path="inventory/imports/:importId/edit"
                                                    element={<StockImportFormPage />}
                                                />
                                                <Route path="transfers" element={<TransferManagementPage />} />
                                                <Route path="trips" element={<TripManagementPage />} />
                                                <Route path="trips/:tripId" element={<TripDetailPage />} />
                                                <Route
                                                    path="transfers/:transferType/:transferId"
                                                    element={<TransferDetailPage />}
                                                />
                                                <Route
                                                    path="transfers/warehouse/new"
                                                    element={<WarehouseTransferFormPage />}
                                                />
                                                <Route
                                                    path="transfers/warehouse/:transferId/edit"
                                                    element={<WarehouseTransferFormPage />}
                                                />
                                                <Route
                                                    path="transfers/representative/new"
                                                    element={<RepresentativeTransferFormPage />}
                                                />
                                                <Route
                                                    path="transfers/representative/:transferId/edit"
                                                    element={<RepresentativeTransferFormPage />}
                                                />
                                                <Route
                                                    path="transfers/representative-return/new"
                                                    element={<RepresentativeReturnFormPage />}
                                                />
                                                <Route
                                                    path="transfers/representative-return/:returnId/edit"
                                                    element={<RepresentativeReturnFormPage />}
                                                />
                                                <Route path="sales" element={<SalesManagementPage />} />
                                                <Route path="sales/:saleId" element={<AdminSaleDetailPage />} />
                                                <Route path="cash" element={<FinanceManagementPage />} />
                                                <Route path="customers" element={<CustomerManagementPage />} />
                                                <Route path="customers/:customerId" element={<CustomerDetailPage />} />
                                                <Route
                                                    path="representatives"
                                                    element={<RepresentativeManagementPage />}
                                                />
                                                <Route
                                                    path="representatives/:representativeId"
                                                    element={<RepresentativeDetailPage />}
                                                />
                                                <Route path="users" element={<AccessManagementPage />} />
                                                <Route path="products" element={<ProductManagementPage />} />
                                                <Route path="products/new" element={<ProductFormPage />} />
                                                <Route path="products/:productId/edit" element={<ProductFormPage />} />
                                                <Route path="vehicles" element={<VehicleManagementPage />} />
                                                <Route path="vehicles/:vehicleId" element={<VehicleDetailPage />} />
                                                <Route path="warehouses" element={<WarehouseManagementPage />} />
                                                <Route
                                                    path="warehouses/:warehouseId/settings"
                                                    element={<WarehouseCoveragePage />}
                                                />
                                                <Route path="settings" element={<SettingsPage />} />
                                                <Route path="*" element={<AdminFoundationPage />} />
                                            </Routes>
                                        </RouteSuspense>
                                    </AdminShell>
                                </ProtectedPortal>
                            }
                        />
                        <Route
                            path="/sales/*"
                            element={
                                <ProtectedPortal portal="sales">
                                    <SalesShell>
                                        <Suspense fallback={<RouteLoading />}>
                                            <Routes>
                                                <Route path="dashboard" element={<RepresentativeDashboardPage />} />
                                                <Route path="trip" element={<CurrentTripPage />} />
                                                <Route path="reports" element={<Navigate replace to="/sales/sales-history" />} />
                                                <Route path="my-stock" element={<RepresentativeStockPage />} />
                                                <Route path="stock-issue-history" element={<Navigate replace to="/sales/my-stock?tab=history" />} />
                                                <Route path="profile" element={<ProfileSettingsPage />} />
                                                <Route path="customers" element={<SalesCustomerPage />} />
                                                <Route path="customers/new" element={<NewSalesCustomerPage />} />
                                                <Route
                                                    path="receivings/:transferId"
                                                    element={<ReceivingDetailPage />}
                                                />
                                                <Route path="new-sale" element={<NewSalePage />} />
                                                <Route path="sales-history" element={<SalesHistoryPage />} />
                                                <Route
                                                    path="sales-history/:saleId"
                                                    element={<SaleHistoryDetailPage />}
                                                />
                                                <Route path="cash-hold" element={<CashWorkspacePage />} />
                                                <Route path="cash-submissions" element={<CashWorkspacePage />} />
                                                <Route path="*" element={<SalesFoundationPage />} />
                                            </Routes>
                                        </Suspense>
                                    </SalesShell>
                                </ProtectedPortal>
                            }
                        />
                        <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
                    </Routes>
                </SessionProvider>
            </BrandingProvider>
        </LocaleProvider>
    );
}
