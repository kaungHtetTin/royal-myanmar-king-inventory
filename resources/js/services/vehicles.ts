import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type VehicleRepresentative = { code: string; id: number; name: string };

export type Vehicle = {
    brand: string | null;
    created_at: string | null;
    id: number;
    is_active: boolean;
    model: string | null;
    notes: string | null;
    representative: VehicleRepresentative | null;
    sales_representative_id: number | null;
    updated_at: string | null;
    vehicle_number: string;
    vehicle_type: string;
};

export type VehicleInput = {
    brand: string;
    is_active: boolean;
    model: string;
    notes: string;
    sales_representative_id: number | null;
    vehicle_number: string;
    vehicle_type: string;
};

export type VehicleFilters = {
    assignment?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    search?: string;
    sort?: string;
    status?: string;
    type?: string;
};

export type VehicleOptions = {
    representatives: Array<VehicleRepresentative & { vehicle_id: number | null }>;
    types: string[];
};

export class VehicleApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new VehicleApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new VehicleApiError(
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

export const vehicleApi = {
    list: (filters: VehicleFilters) =>
        request<{ data: Vehicle[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/admin/vehicles', {
                params: { ...filters, per_page: 20 },
            }),
        ),
    options: () => request<VehicleOptions>(() => window.axios.get('api/admin/vehicle-options')),
    create: (input: VehicleInput) => request<{ data: Vehicle }>(() => window.axios.post('api/admin/vehicles', input)),
    update: (id: number, input: VehicleInput) =>
        request<{ data: Vehicle }>(() => window.axios.put(`api/admin/vehicles/${id}`, input)),
};
