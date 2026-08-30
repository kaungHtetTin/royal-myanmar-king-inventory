import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type Product = {
    barcode: string | null;
    category: string | null;
    created_at: string | null;
    description: string | null;
    discount_percentage: number;
    id: number;
    is_active: boolean;
    name: string;
    selling_price: number;
    sku: string;
    unit: string;
    updated_at: string | null;
    units: ProductUnit[];
};
export type UnitPrice = { region_id: number; price: number };
export type ProductUnit = {
    id?: number;
    name: string;
    conversion_factor: number;
    barcode: string | null;
    is_base: boolean;
    is_default_selling: boolean;
    is_active: boolean;
    prices: UnitPrice[];
};

export type ProductInput = {
    barcode: string;
    category: string;
    description: string;
    discount_percentage: number;
    is_active: boolean;
    name: string;
    selling_price: number;
    sku: string;
    unit: string;
    units: ProductUnit[];
};

export type ProductFilters = {
    category?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    search?: string;
    sort?: string;
    status?: string;
    unit?: string;
};

export type ProductRegion = { id: number; name: string; warehouse: { id: number; code: string; name: string } };
export type ProductOptions = { categories: string[]; units: string[]; regions: ProductRegion[] };
export type ProductSummary = { active: number; categories: number; inactive: number; total: number };

export class ProductApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new ProductApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new ProductApiError(
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

export const productApi = {
    list: (filters: ProductFilters) =>
        request<{ data: Product[]; meta: PaginationMeta; summary: ProductSummary }>(() =>
            window.axios.get('api/admin/products', {
                params: { ...filters, per_page: 20 },
            }),
        ),
    get: (id: number) => request<{ data: Product }>(() => window.axios.get(`api/admin/products/${id}`)),
    options: () => request<ProductOptions>(() => window.axios.get('api/admin/product-options')),
    create: (input: ProductInput) => request<{ data: Product }>(() => window.axios.post('api/admin/products', input)),
    update: (id: number, input: ProductInput) =>
        request<{ data: Product }>(() => window.axios.put(`api/admin/products/${id}`, input)),
};
