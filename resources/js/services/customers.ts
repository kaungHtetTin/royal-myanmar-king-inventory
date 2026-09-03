import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type CustomerWarehouse = { code: string; id: number; name: string };

export type Customer = {
    address: string | null;
    code: string;
    created_at: string | null;
    credit_allowed: boolean;
    credit_limit: number;
    customer_type: string | null;
    id: number;
    is_active: boolean;
    name: string;
    notes: string | null;
    phone: string | null;
    region: { id: number; name: string; warehouse_id: number } | null;
    region_id: number;
    township: string | null;
    updated_at: string | null;
    warehouse: CustomerWarehouse;
    warehouse_id: number;
};

export type CustomerInput = {
    address: string;
    code: string;
    credit_allowed: boolean;
    credit_limit: number;
    customer_type: string;
    is_active: boolean;
    name: string;
    notes: string;
    phone: string;
    region_id: number;
    township: string;
    warehouse_id: number;
};

export type CustomerFilters = {
    credit?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    region_id?: number | string;
    search?: string;
    sort?: string;
    status?: string;
    type?: string;
    warehouse_id?: number | string;
};

export type CustomerOptions = {
    types: string[];
    warehouses: CustomerWarehouse[];
    regions: Array<{ id: number; warehouse_id: number; name: string }>;
};
export type CustomerSummary = { active: number; credit_enabled: number; credit_limit: number; total: number };
export type CustomerSaleReportProduct = {
    product: {
        base_unit: { conversion_factor: number; name: string } | null;
        default_selling_unit: { conversion_factor: number; name: string } | null;
        id: number;
        name: string;
        sku: string;
        unit: string;
    };
    foc_quantity: number;
    purchased_quantity: number;
    total_quantity: number;
};
export type CustomerSaleReport = {
    data: CustomerSaleReportProduct[];
    summary: { foc_quantity: number; products: number; purchased_quantity: number; total_quantity: number };
};

export class CustomerApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new CustomerApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new CustomerApiError(
        response?.data.message ?? 'Unable to complete the request.',
        response?.data.errors ?? {},
    );
}

async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw apiError(error);
    }
}

export const customerApi = {
    list: (filters: CustomerFilters) =>
        request<{ data: Customer[]; meta: PaginationMeta; summary: CustomerSummary }>(() =>
            window.axios.get('api/admin/customers', {
                params: { ...filters, per_page: 20 },
            }),
        ),
    options: () => request<CustomerOptions>(() => window.axios.get('api/admin/customer-options')),
    get: (id: number) => request<{ data: Customer }>(() => window.axios.get(`api/admin/customers/${id}`)),
    saleReport: (id: number, filters: { date_from?: string; date_to?: string }) =>
        request<CustomerSaleReport>(() =>
            window.axios.get(`api/admin/customers/${id}/sale-report`, { params: filters }),
        ),
    create: (input: CustomerInput) =>
        request<{ data: Customer }>(() => window.axios.post('api/admin/customers', input)),
    update: (id: number, input: CustomerInput) =>
        request<{ data: Customer }>(() => window.axios.put(`api/admin/customers/${id}`, input)),
    updateCredit: (id: number, input: Pick<CustomerInput, 'credit_allowed' | 'credit_limit'>) =>
        request<{ data: Customer }>(() => window.axios.put(`api/admin/customers/${id}/credit`, input)),
};
