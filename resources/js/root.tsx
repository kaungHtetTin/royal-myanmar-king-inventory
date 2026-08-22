import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedPortal } from './auth/protected-portal';
import { SessionProvider } from './auth/session';
import { BrandingProvider } from './branding/branding-provider';
import type { SessionUser } from './auth/session-context';
import { AdminShell } from './layouts/admin-shell';
import { SalesShell } from './layouts/sales-shell';
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
const ProductManagementPage = lazy(() =>
    import('./pages/admin/product-management-page').then((module) => ({
        default: module.ProductManagementPage,
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
const TransferManagementPage = lazy(() =>
    import('./pages/admin/transfer-management-page').then((module) => ({
        default: module.TransferManagementPage,
    })),
);
const VehicleManagementPage = lazy(() =>
    import('./pages/admin/vehicle-management-page').then((module) => ({
        default: module.VehicleManagementPage,
    })),
);
const WarehouseManagementPage = lazy(() =>
    import('./pages/admin/warehouse-management-page').then((module) => ({
        default: module.WarehouseManagementPage,
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
const RepresentativeStockPage = lazy(() =>
    import('./pages/sales/representative-stock-page').then((module) => ({
        default: module.RepresentativeStockPage,
    })),
);
const SalesReportPage = lazy(() =>
    import('./pages/sales/sales-report-page').then((module) => ({
        default: module.SalesReportPage,
    })),
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
    return (
        <div className="ui-loading" role="status">
            <span />
            Loading workspace…
        </div>
    );
}

export default function Root({ initialUser }: { initialUser?: SessionUser | null }) {
    return (
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
                                    <Suspense fallback={<RouteLoading />}>
                                        <Routes>
                                            <Route path="dashboard" element={<AdminDashboardPage />} />
                                            <Route path="reports" element={<ReportsPage />} />
                                            <Route path="audit-logs" element={<AuditLogPage />} />
                                            <Route path="inventory" element={<InventoryManagementPage />} />
                                            <Route path="inventory/imports/new" element={<StockImportFormPage />} />
                                            <Route
                                                path="inventory/imports/:importId/edit"
                                                element={<StockImportFormPage />}
                                            />
                                            <Route path="transfers" element={<TransferManagementPage />} />
                                            <Route path="sales" element={<SalesManagementPage />} />
                                            <Route path="cash" element={<FinanceManagementPage />} />
                                            <Route path="customers" element={<CustomerManagementPage />} />
                                            <Route path="representatives" element={<RepresentativeManagementPage />} />
                                            <Route
                                                path="representatives/:representativeId"
                                                element={<RepresentativeDetailPage />}
                                            />
                                            <Route path="users" element={<AccessManagementPage />} />
                                            <Route path="products" element={<ProductManagementPage />} />
                                            <Route path="vehicles" element={<VehicleManagementPage />} />
                                            <Route path="warehouses" element={<WarehouseManagementPage />} />
                                            <Route path="settings" element={<SettingsPage />} />
                                            <Route path="*" element={<AdminFoundationPage />} />
                                        </Routes>
                                    </Suspense>
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
                                            <Route path="reports" element={<SalesReportPage />} />
                                            <Route path="my-stock" element={<RepresentativeStockPage />} />
                                            <Route path="new-sale" element={<NewSalePage />} />
                                            <Route path="sales-history" element={<SalesHistoryPage />} />
                                            <Route path="sales-history/:saleId" element={<SaleHistoryDetailPage />} />
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
    );
}
