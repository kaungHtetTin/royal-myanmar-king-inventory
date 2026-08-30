import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type Actor = { id: number; name: string } | null;
export type CashSubmissionStatus = 'pending' | 'confirmed' | 'cancelled' | 'reversed';
export type CustomerPaymentStatus = 'draft' | 'posted' | 'voided';
export type CashTransaction = {
    id: number;
    type: string;
    amount_delta: number;
    reference: string;
    notes: string | null;
    actor: Actor;
    occurred_at: string;
};
export type CashSubmission = {
    id: number;
    reference: string;
    trip?: { id: number; reference: string; title: string } | null;
    representative: { id: number; code: string; name: string };
    warehouse: { id: number; code: string; name: string };
    amount: number;
    status: CashSubmissionStatus;
    notes: string | null;
    created_by: Actor;
    confirmed_by: Actor;
    confirmed_at: string | null;
    cancelled_by: Actor;
    cancelled_at: string | null;
    cancel_reason: string | null;
    reversed_by: Actor;
    reversed_at: string | null;
    reversal_reason: string | null;
    created_at: string | null;
};
export type CashOverview = {
    representative: { id: number; code: string; name: string };
    cash_hold: number;
    pending_submissions: number;
    available_to_submit: number;
};
export type RepresentativeCashBalance = {
    id: number;
    code: string;
    name: string;
    warehouse: { id: number; code: string; name: string };
    cash_hold: number;
    pending_submissions: number;
    available_to_submit: number;
};
export type AdminCashCollectionInput = { sales_representative_id: number; amount: number; notes: string };
export type CustomerCreditBalance = {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    warehouse: { id: number; code: string; name: string };
    credit_limit: number;
    outstanding_amount: number;
};
export type CustomerPayment = {
    id: number;
    reference: string;
    warehouse: { id: number; code: string; name: string };
    customer: { id: number; code: string; name: string };
    amount: number;
    payment_date: string;
    payment_method: string;
    payment_method_name?: string;
    adds_to_cash_hold?: boolean;
    payment_reference: string | null;
    notes: string | null;
    status: CustomerPaymentStatus;
    received_by: Actor;
    created_by: Actor;
    posted_by: Actor;
    posted_at: string | null;
    voided_by: Actor;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string | null;
};
export type PaymentOptions = {
    customers: Array<{
        id: number;
        code: string;
        name: string;
        warehouse_id: number;
        outstanding_amount: number;
    }>;
    warehouses: Array<{ id: number; code: string; name: string }>;
    payment_methods: Array<{ key: string; name: string; adds_to_cash_hold: boolean; is_active: boolean }>;
};
export type CustomerPaymentInput = {
    customer_id: number;
    amount: number;
    payment_date: string;
    payment_method: string;
    payment_reference: string;
    notes: string;
};

export class FinanceError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
        public readonly code?: string,
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new FinanceError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            code?: string;
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new FinanceError(
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
const pageParams = (page = 1) => ({ page, per_page: 10 });
export type FinanceListFilters = { page?: number; search?: string; warehouse_id?: number };

export const financeApi = {
    ownOverview: () => request<CashOverview>(() => window.axios.get('api/sales/cash-hold')),
    ownSubmissions: (page = 1, tripId?: number) =>
        request<{ data: CashSubmission[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/cash-submissions', {
                params: { ...pageParams(page), ...(tripId ? { trip_id: tripId } : {}) },
            }),
        ),
    ownCashActivity: (page = 1) =>
        request<{ data: CashTransaction[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/cash-transactions', { params: pageParams(page) }),
        ),
    submitCash: (input: { amount: number; notes: string }) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post('api/sales/cash-submissions', input, {
                headers: headers(),
            }),
        ),
    cancelSubmission: (id: number, reason: string) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post(`api/sales/cash-submissions/${id}/cancel`, { reason }, { headers: headers() }),
        ),
    cashBalances: (filters: FinanceListFilters = {}) =>
        request<{
            data: RepresentativeCashBalance[];
            meta: PaginationMeta;
            summary: { cash_held: number; pending_handover: number };
        }>(() =>
            window.axios.get('api/admin/cash-balances', {
                params: { ...pageParams(filters.page), ...filters },
            }),
        ),
    cashSubmissions: (filters: FinanceListFilters & { representative_id?: number } = {}) =>
        request<{ data: CashSubmission[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/admin/cash-submissions', {
                params: { ...pageParams(filters.page), ...filters },
            }),
        ),
    confirmSubmission: (id: number) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post(`api/admin/cash-submissions/${id}/confirm`, {}, { headers: headers() }),
        ),
    collectCash: (input: AdminCashCollectionInput) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post('api/admin/cash-submissions', input, { headers: headers() }),
        ),
    reverseSubmission: (id: number, reason: string) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post(`api/admin/cash-submissions/${id}/reverse`, { reason }, { headers: headers() }),
        ),
    creditBalances: (filters: FinanceListFilters = {}) =>
        request<{ data: CustomerCreditBalance[]; meta: PaginationMeta; summary: { outstanding: number } }>(() =>
            window.axios.get('api/admin/customer-credit-balances', {
                params: { ...pageParams(filters.page), ...filters },
            }),
        ),
    paymentOptions: () => request<PaymentOptions>(() => window.axios.get('api/admin/customer-payment-options')),
    payments: (filters: FinanceListFilters = {}) =>
        request<{ data: CustomerPayment[]; meta: PaginationMeta; summary: { draft_amount: number } }>(() =>
            window.axios.get('api/admin/customer-payments', {
                params: { ...pageParams(filters.page), ...filters },
            }),
        ),
    createPayment: (input: CustomerPaymentInput) =>
        request<{ data: CustomerPayment }>(() =>
            window.axios.post('api/admin/customer-payments', input, {
                headers: headers(),
            }),
        ),
    postPayment: (id: number) =>
        request<{ data: CustomerPayment }>(() =>
            window.axios.post(`api/admin/customer-payments/${id}/post`, {}, { headers: headers() }),
        ),
    voidPayment: (id: number, reason: string) =>
        request<{ data: CustomerPayment }>(() =>
            window.axios.post(`api/admin/customer-payments/${id}/void`, { reason }, { headers: headers() }),
        ),
};
