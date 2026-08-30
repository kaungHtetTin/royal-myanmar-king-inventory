import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type Identity = { id: number; code: string; name: string };
export type ProductIdentity = {
    id: number;
    sku: string;
    name: string;
    category?: string | null;
    unit: string;
};
export type AdminDashboard = {
    as_of: string;
    warehouses: Identity[];
    selected_warehouse_id: number | null;
    kpis: {
        warehouse_stock: number;
        products: number;
        active_representatives: number;
        today_sales: number;
        today_cash_sales: number;
        today_credit_sales: number;
        customer_outstanding: number;
        representative_cash: number;
        pending_warehouse_transfers: number;
        pending_representative_receivings: number;
        pending_cash_submissions: number;
        low_stock_products?: number;
        low_stock_threshold?: number;
    };
    recent_movements: Array<{
        id: number;
        reference: string;
        type: string;
        product: ProductIdentity;
        quantity: number;
        actor: { id: number; name: string };
        occurred_at: string;
    }>;
};
export type SalesDashboard = {
    as_of: string;
    representative: Identity;
    kpis: {
        stock_units: number;
        stock_products: number;
        pending_receivings: number;
        today_sales: number;
        today_cash_sales: number;
        today_credit_sales: number;
        cash_hold: number;
    };
    stock: Array<{ id: number; quantity: number; product: ProductIdentity }>;
    recent_sales: Array<{
        id: number;
        reference: string;
        customer: Identity;
        payment_type: 'cash' | 'credit';
        status: 'draft' | 'posted' | 'voided';
        total_amount: number;
        total_quantity: number;
        created_at: string | null;
    }>;
    pending_receivings: Array<{
        id: number;
        reference: string;
        warehouse: Identity;
        total_quantity: number;
        products: number;
        items: Array<{ id: number; quantity: number; product: ProductIdentity }>;
        dispatched_at: string | null;
    }>;
};
export type ReportName = 'sales' | 'representatives' | 'customers';
export type ReportOptions = {
    warehouses: Identity[];
    reports: ReportName[];
};
export type ReportFilters = {
    page?: number;
    warehouse_id?: number;
    representative_id?: number;
    customer_id?: number;
    product_id?: number;
    category?: string;
    region?: string;
    status?: string;
    payment_type?: string;
    movement_type?: string;
    search?: string;
    date_from?: string;
    date_to?: string;
    sort?: string;
    direction?: string;
    min_amount?: number;
};
export type ReportRow = Record<string, unknown>;
export type ReportResponse = {
    analysis?: {
        month_trend?: Array<{
            amount: number;
            date: string;
            label: string;
        }>;
        year_trend?: Array<{ amount: number; label: string; month: number }>;
        top_products?: Array<{
            amount: number;
            product: ProductIdentity;
            units: number;
        }>;
    };
    report: ReportName;
    data: ReportRow[];
    meta: PaginationMeta;
    summary: Record<string, number>;
    rules: Record<string, string>;
};
export type AuditRow = {
    id: number;
    event: string;
    module: string;
    action: string;
    actor: { id: number; name: string; username: string } | null;
    subject_type: string | null;
    subject_id: number | null;
    subject_url: string | null;
    old: Record<string, unknown> | null;
    new: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    ip_address: string | null;
    created_at: string | null;
};
export type AuditResponse = {
    data: AuditRow[];
    meta: PaginationMeta;
    filters: {
        warehouses: Identity[];
        actors: Array<{ id: number; name: string; username: string }>;
        modules: string[];
    };
};

export class ReportingError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}
function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new ReportingError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new ReportingError(response?.data.message ?? 'Unable to load reporting data.', response?.data.errors ?? {});
}
async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw apiError(error);
    }
}
export const reportingApi = {
    adminDashboard: (warehouseId?: number) =>
        request<AdminDashboard>(() =>
            window.axios.get('api/admin/dashboard', {
                params: warehouseId ? { warehouse_id: warehouseId } : {},
            }),
        ),
    salesDashboard: () => request<SalesDashboard>(() => window.axios.get('api/sales/dashboard')),
    options: () => request<ReportOptions>(() => window.axios.get('api/admin/report-options')),
    report: (report: ReportName, filters: ReportFilters, perPage = 25) =>
        request<ReportResponse>(() =>
            window.axios.get(`api/admin/reports/${report}`, {
                params: { ...filters, per_page: perPage },
            }),
        ),
    audits: (
        filters: ReportFilters & {
            actor_id?: number;
            module?: string;
            action?: string;
        },
    ) =>
        request<AuditResponse>(() =>
            window.axios.get('api/admin/audit-logs', {
                params: { ...filters, per_page: 25 },
            }),
        ),
};
