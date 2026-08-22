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
};
export type Sale = {
    id: number;
    reference: string;
    representative: { id: number; code: string; name: string; phone?: string | null };
    warehouse: { id: number; code: string; name: string; address?: string | null; phone?: string | null };
    customer: { id: number; code: string; name: string; address?: string | null; phone?: string | null };
    payment_type: PaymentType;
    total_amount: number;
    status: SaleStatus;
    notes: string | null;
    items: SaleItem[];
    total_quantity: number;
    posted_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string | null;
};
export type SaleCustomerOption = {
    id: number;
    code: string;
    name: string;
    credit_allowed: boolean;
    credit_limit: number;
    outstanding_amount: number;
    available_credit: number;
};
export type SaleProductOption = SaleProduct & {
    selling_price: number;
    quantity: number;
};
export type SaleOptions = {
    representative: { id: number; code: string; name: string };
    customers: SaleCustomerOption[];
    products: SaleProductOption[];
    cash_hold: number;
};
export type SaleInput = {
    customer_id: number;
    payment_type: PaymentType;
    notes: string;
    items: { product_id: number; quantity: number }[];
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
    ownSales: (filters: SaleFilters = {}) =>
        request<{ data: Sale[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/sales', { params: { ...filters, per_page: 10 } }),
        ),
    ownSale: (id: number) => request<{ data: Sale }>(() => window.axios.get(`api/sales/sales/${id}`)),
    create: (input: SaleInput) =>
        request<{ data: Sale }>(() => window.axios.post('api/sales/sales', input, { headers: headers() })),
    update: (id: number, input: SaleInput) =>
        request<{ data: Sale }>(() => window.axios.put(`api/sales/sales/${id}`, input)),
    post: (id: number) =>
        request<{ data: Sale }>(() => window.axios.post(`api/sales/sales/${id}/post`, {}, { headers: headers() })),
    adminSales: (filters: SaleFilters = {}) =>
        request<{ data: Sale[]; meta: PaginationMeta; summary: SaleSummary }>(() =>
            window.axios.get('api/admin/sales', { params: pages(filters) }),
        ),
    void: (id: number, reason: string) =>
        request<{ data: Sale }>(() =>
            window.axios.post(`api/admin/sales/${id}/void`, { reason }, { headers: headers() }),
        ),
};
