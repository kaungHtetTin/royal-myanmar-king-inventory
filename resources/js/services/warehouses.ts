import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type Warehouse = {
    address: string | null;
    code: string;
    created_at: string | null;
    id: number;
    is_active: boolean;
    name: string;
    notes: string | null;
    phone: string | null;
    updated_at: string | null;
    users_count: number;
    regions: WarehouseRegion[];
};
export type WarehouseWay = {
    id: number;
    region_id: number;
    code: string;
    name: string;
    notes: string | null;
    is_active: boolean;
};
export type WarehouseRegion = {
    id: number;
    warehouse_id: number;
    name: string;
    notes: string | null;
    is_active: boolean;
    ways: WarehouseWay[];
};
export type CoverageInput = { name: string; notes: string; is_active: boolean };

export type WarehouseInput = {
    address: string;
    code: string;
    is_active: boolean;
    name: string;
    notes: string;
    phone: string;
};

export type WarehouseFilters = {
    direction?: 'asc' | 'desc';
    page?: number;
    search?: string;
    sort?: string;
    status?: string;
};
export type WarehouseSummary = { active: number; assigned_users: number; inactive: number; total: number };

export class WarehouseApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new WarehouseApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new WarehouseApiError(
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

export const warehouseApi = {
    list: (filters: WarehouseFilters) =>
        request<{ data: Warehouse[]; meta: PaginationMeta; summary: WarehouseSummary }>(() =>
            window.axios.get('api/admin/warehouses', {
                params: { ...filters, per_page: 20 },
            }),
        ),
    get: (id: number) => request<{ data: Warehouse }>(() => window.axios.get(`api/admin/warehouses/${id}`)),
    create: (input: WarehouseInput) =>
        request<{ data: Warehouse }>(() => window.axios.post('api/admin/warehouses', input)),
    update: (id: number, input: WarehouseInput) =>
        request<{ data: Warehouse }>(() => window.axios.put(`api/admin/warehouses/${id}`, input)),
    createRegion: (warehouseId: number, input: CoverageInput) =>
        request<{ data: WarehouseRegion }>(() =>
            window.axios.post(`api/admin/warehouses/${warehouseId}/regions`, input),
        ),
    updateRegion: (id: number, input: CoverageInput) =>
        request<{ data: WarehouseRegion }>(() => window.axios.put(`api/admin/regions/${id}`, input)),
    createWay: (regionId: number, input: CoverageInput) =>
        request<{ data: WarehouseWay }>(() => window.axios.post(`api/admin/regions/${regionId}/ways`, input)),
    updateWay: (id: number, input: CoverageInput) =>
        request<{ data: WarehouseWay }>(() => window.axios.put(`api/admin/ways/${id}`, input)),
};
