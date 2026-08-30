import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';
import type { CashSubmission, CustomerPayment } from './finance';
import type { Sale } from './sales';
import type { RepresentativeTransfer } from './transfers';

export type TripStatus = 'planning' | 'operation' | 'ending' | 'completed' | 'cancelled';
export type TripActor = { id: number; name: string } | null;
export type TripExpense = {
    id: number;
    description: string;
    amount: number;
    spent_at: string;
    notes: string | null;
    created_by: TripActor;
};
export type TripProductSummary = {
    product: { id: number; sku: string; name: string; unit: string };
    issued: number;
    issued_foc: number;
    sold: number;
    sold_foc: number;
    returned: number;
    returned_foc: number;
    remaining: number;
    remaining_foc: number;
};
export type Trip = {
    id: number;
    reference: string;
    title: string;
    status: TripStatus;
    warehouse: { id: number; code: string; name: string };
    region: { id: number; name: string; warehouse_id: number };
    representative: { id: number; code: string; name: string; phone?: string | null };
    vehicle: { id: number; vehicle_number: string; vehicle_type: string; brand?: string; model?: string };
    notes: string | null;
    opening_cash_balance: number;
    stock_variance_units: number;
    cash_variance_amount: number;
    completion_notes: string | null;
    created_at: string;
    started_at: string | null;
    ending_at: string | null;
    completed_at: string | null;
    cancelled_at: string | null;
    cancel_reason: string | null;
    created_by: TripActor;
    started_by: TripActor;
    ending_by: TripActor;
    completed_by: TripActor;
    cancelled_by: TripActor;
    stock_issues?: RepresentativeTransfer[];
    stock_returns?: RepresentativeTransfer[];
    sales?: Sale[];
    expenses?: TripExpense[];
    cash_submissions?: CashSubmission[];
    customer_payments?: CustomerPayment[];
    product_summary?: TripProductSummary[];
    current_stock_units?: number;
    financial_summary?: {
        cash_sales: number;
        cash_hold_sales: number;
        credit_sales: number;
        credit_collected: number;
        cash_credit_collected: number;
        payment_method_totals: Array<{
            key: string;
            name: string;
            adds_to_cash_hold: boolean;
            is_active: boolean;
            sales_amount: number;
            collection_amount: number;
            total_amount: number;
        }>;
        latest_credit_balance: number;
        expenses: number;
        cash_submitted_confirmed: number;
        cash_submitted_pending: number;
        current_cash_hold: number;
    };
};
export type TripOptions = {
    warehouses: Array<{ id: number; code: string; name: string }>;
    regions: Array<{ id: number; warehouse_id: number; name: string }>;
    representatives: Array<{
        id: number;
        code: string;
        name: string;
        primary_warehouse_id: number;
        regions: Array<{ id: number; name: string; warehouse_id: number }>;
    }>;
    vehicles: Array<{
        id: number;
        vehicle_number: string;
        vehicle_type: string;
        brand?: string;
        model?: string;
        sales_representative_id: number | null;
    }>;
};
export type TripInput = {
    title: string;
    warehouse_id: number;
    region_id: number;
    sales_representative_id: number;
    vehicle_id: number;
    notes: string;
};

export class TripApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
        public readonly code?: string,
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new TripApiError('Something went wrong. Please try again.');
    const response = (error as AxiosError<{ code?: string; errors?: Record<string, string[]>; message?: string }>).response;
    return new TripApiError(response?.data.message ?? 'Unable to complete the request.', response?.data.errors ?? {}, response?.data.code);
}

async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw apiError(error);
    }
}

export const tripApi = {
    options: () => request<TripOptions>(() => window.axios.get('api/admin/trip-options')),
    list: (filters: { page?: number; status?: string; search?: string; date_from?: string; date_to?: string } = {}) =>
        request<{ data: Trip[]; meta: PaginationMeta; summary: { total: number; planning: number; operation: number; ending: number } }>(() =>
            window.axios.get('api/admin/trips', { params: { ...filters, per_page: 20 } }),
        ),
    show: (id: number) => request<{ data: Trip }>(() => window.axios.get(`api/admin/trips/${id}`)),
    create: (input: TripInput) => request<{ data: Trip }>(() => window.axios.post('api/admin/trips', input)),
    command: (id: number, command: 'start' | 'begin-ending', payload = {}) =>
        request<{ data: Trip }>(() => window.axios.post(`api/admin/trips/${id}/${command}`, payload)),
    cancel: (id: number, reason: string) =>
        request<{ data: Trip }>(() => window.axios.post(`api/admin/trips/${id}/cancel`, { reason })),
    complete: (id: number, notes = '') =>
        request<{ data: Trip }>(() => window.axios.post(`api/admin/trips/${id}/complete`, { notes })),
    current: () => request<{ data: Trip | null }>(() => window.axios.get('api/sales/current-trip')),
    addExpense: (tripId: number, input: { description: string; amount: number; notes: string }) =>
        request<{ expense: TripExpense }>(() => window.axios.post(`api/sales/trips/${tripId}/expenses`, input)),
    beginOwnEnding: (tripId: number) =>
        request<{ data: Trip }>(() => window.axios.post(`api/sales/trips/${tripId}/begin-ending`)),
};
