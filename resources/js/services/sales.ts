import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type SaleStatus = 'draft' | 'posted' | 'voided';
export type PaymentType = 'cash' | 'credit';
export type SaleProduct = {
    id: number;
    sku: string;
    name: string;
    unit: string;
};
export type SaleItem = {
    id: number;
    product: SaleProduct;
    quantity: number;
    unit_price: number;
    line_total: number;
    base_quantity?: number;
    unit?: SaleUnit | null;
    foc_quantity?: number;
    foc_base_quantity?: number;
    foc_unit?: SaleUnit | null;
};
export type SaleUnit = {
    id: number;
    name: string;
    conversion_factor: number;
    is_base?: boolean;
    is_default_selling?: boolean;
    prices?: Array<{ region_id: number; price: number }>;
};
export type Sale = {
    id: number;
    reference: string;
    representative: { id: number; code: string; name: string; phone?: string | null };
    warehouse: { id: number; code: string; name: string; address?: string | null; phone?: string | null };
    region?: { id: number; name: string } | null;
    way?: { id: number; code: string; name: string } | null;
    customer: { id: number; code: string; name: string; address?: string | null; phone?: string | null };
    payment_type: PaymentType;
    total_amount: number;
    status: SaleStatus;
    notes: string | null;
    creation_location: {
        latitude: number;
        longitude: number;
        accuracy_meters: number | null;
        captured_at: string | null;
    } | null;
    items: SaleItem[];
    total_quantity: number;
    total_foc_quantity?: number;
    posted_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string | null;
    created_by?: { id: number; name: string } | null;
    posted_by?: { id: number; name: string } | null;
    voided_by?: { id: number; name: string } | null;
};
export type SaleCustomerOption = {
    id: number;
    code: string;
    name: string;
    credit_allowed: boolean;
    credit_limit: number;
    outstanding_amount: number;
    available_credit: number;
    way: { id: number; code: string; name: string; region: { id: number; name: string; warehouse_id: number } };
};
export type SalesCustomerInput = {
    address: string;
    customer_type: string;
    name: string;
    notes: string;
    phone: string;
    region: string;
    township: string;
    way_id: number;
};
export type SalesCustomer = SalesCustomerInput & {
    code: string;
    created_at: string | null;
    credit_allowed: boolean;
    credit_limit: number;
    id: number;
    is_active: boolean;
    way: {
        code: string;
        id: number;
        name: string;
        region: {
            id: number;
            name: string;
            warehouse: { code: string; id: number; name: string } | null;
            warehouse_id: number;
        } | null;
    } | null;
};
export type SaleProductOption = SaleProduct & {
    selling_price: number;
    quantity: number;
    foc_quantity: number;
    units: SaleUnit[];
};
export type SaleOptions = {
    representative: {
        id: number;
        code: string;
        name: string;
        regions?: Array<{ id: number; name: string; ways: Array<{ id: number; code: string; name: string }> }>;
    };
    customers: SaleCustomerOption[];
    products: SaleProductOption[];
    cash_hold: number;
};
export type SaleInput = {
    customer_id: number;
    payment_type: PaymentType;
    notes: string;
    creation_latitude?: number;
    creation_longitude?: number;
    location_accuracy_meters?: number;
    items: {
        product_id: number;
        product_unit_id?: number;
        quantity: number;
        foc_product_unit_id?: number;
        foc_quantity?: number;
    }[];
};
export type SaleFilters = {
    date_from?: string;
    date_to?: string;
    page?: number;
    warehouse_id?: number;
    representative_id?: number;
    customer_id?: number;
    payment_type?: string;
    period?: string;
    status?: string;
    search?: string;
};
export type SaleSummary = { cash_total: number; credit_total: number; posted_total: number; total: number };

export class SaleApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
        public readonly code?: string,
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new SaleApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            code?: string;
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new SaleApiError(
        response?.data.message ?? 'Unable to complete the request.',
        response?.data.errors ?? {},
        response?.data.code,
    );
}

async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw apiError(error);
    }
}

const headers = () => ({ 'Idempotency-Key': crypto.randomUUID() });
const pages = (filters: SaleFilters) => ({ ...filters, per_page: 20 });

export const saleApi = {
    options: () => request<SaleOptions>(() => window.axios.get('api/sales/sale-options')),
    createCustomer: (input: SalesCustomerInput) =>
        request<{ customer: SaleCustomerOption }>(() => window.axios.post('api/sales/customers', input)),
    customers: (filters: { page?: number; search?: string } = {}) =>
        request<{ data: SalesCustomer[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/customers', { params: filters }),
        ),
    ownSales: (filters: SaleFilters = {}) =>
        request<{ data: Sale[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/sales', { params: { ...filters, per_page: 10 } }),
        ),
    ownSale: (id: number) => request<{ data: Sale }>(() => window.axios.get(`api/sales/sales/${id}`)),
    create: (
        input: SaleInput & {
            creation_latitude: number;
            creation_longitude: number;
            location_accuracy_meters?: number;
        },
    ) => request<{ data: Sale }>(() => window.axios.post('api/sales/sales', input, { headers: headers() })),
    update: (id: number, input: SaleInput) =>
        request<{ data: Sale }>(() => window.axios.put(`api/sales/sales/${id}`, input)),
    post: (id: number) =>
        request<{ data: Sale }>(() => window.axios.post(`api/sales/sales/${id}/post`, {}, { headers: headers() })),
    adminSales: (filters: SaleFilters = {}) =>
        request<{ data: Sale[]; meta: PaginationMeta; summary: SaleSummary }>(() =>
            window.axios.get('api/admin/sales', { params: pages(filters) }),
        ),
    adminSale: (id: number) => request<{ data: Sale }>(() => window.axios.get(`api/admin/sales/${id}`)),
    void: (id: number, reason: string) =>
        request<{ data: Sale }>(() =>
            window.axios.post(`api/admin/sales/${id}/void`, { reason }, { headers: headers() }),
        ),
};
