import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type RepresentativeWarehouse = {
    code: string;
    id: number;
    name: string;
};
export type RepresentativeVehicle = {
    id: number;
    sales_representative_id: number | null;
    vehicle_number: string;
    vehicle_type: string;
};

export type Representative = {
    account: {
        email: string | null;
        id: number;
        is_active: boolean;
        last_login_at: string | null;
        username: string;
    };
    code: string;
    created_at: string | null;
    email: string | null;
    id: number;
    is_active: boolean;
    name: string;
    notes: string | null;
    phone: string | null;
    primary_warehouse: RepresentativeWarehouse;
    primary_warehouse_id: number;
    region: string | null;
    region_ids: number[];
    regions: Array<{ id: number; warehouse_id: number; name: string }>;
    updated_at: string | null;
    vehicle: Omit<RepresentativeVehicle, 'sales_representative_id'> | null;
};

export type RepresentativeInput = {
    code: string;
    email: string;
    is_active: boolean;
    name: string;
    notes: string;
    password: string;
    password_confirmation: string;
    phone: string;
    primary_warehouse_id: number;
    region: string;
    region_ids: number[];
    username: string;
    vehicle_id: number | null;
};

export type RepresentativeFilters = {
    direction?: 'asc' | 'desc';
    page?: number;
    search?: string;
    sort?: string;
    status?: string;
    vehicle?: string;
    warehouse_id?: number | string;
};
export type RepresentativeOptions = {
    vehicles: RepresentativeVehicle[];
    warehouses: RepresentativeWarehouse[];
    regions: Array<{ id: number; warehouse_id: number; name: string; warehouse: RepresentativeWarehouse }>;
};
export type RepresentativeSummary = { active: number; signed_in: number; total: number; with_vehicle: number };
export type RepresentativeOverview = {
    representative: Representative;
    visibility: { cash: boolean; sales: boolean; stock: boolean };
    kpis: {
        cash_hold: number | null;
        pending_submission_count: number | null;
        pending_submissions: number | null;
        sales_30_days: number | null;
        sales_transactions_30_days: number | null;
        stock_products: number | null;
        stock_units: number | null;
    };
    sales_chart: Array<{ amount: number; date: string; transactions: number }>;
};

export class RepresentativeApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new RepresentativeApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new RepresentativeApiError(
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

export const representativeApi = {
    overview: (id: number) =>
        request<RepresentativeOverview>(() => window.axios.get(`api/admin/representatives/${id}`)),
    list: (filters: RepresentativeFilters) =>
        request<{ data: Representative[]; meta: PaginationMeta; summary: RepresentativeSummary }>(() =>
            window.axios.get('api/admin/representatives', {
                params: { ...filters, per_page: 20 },
            }),
        ),
    options: () => request<RepresentativeOptions>(() => window.axios.get('api/admin/representative-options')),
    create: (input: RepresentativeInput) =>
        request<{ data: Representative }>(() => window.axios.post('api/admin/representatives', input)),
    update: (id: number, input: RepresentativeInput) =>
        request<{ data: Representative }>(() => window.axios.put(`api/admin/representatives/${id}`, input)),
};
