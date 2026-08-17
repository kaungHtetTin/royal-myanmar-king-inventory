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
    transactions: CashTransaction[];
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
    payment_methods: string[];
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
const pageParams = { per_page: 50 };

export const financeApi = {
    ownOverview: () => request<CashOverview>(() => window.axios.get('api/sales/cash-hold')),
    ownSubmissions: () =>
        request<{ data: CashSubmission[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/cash-submissions', {
                params: pageParams,
            }),
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
    cashBalances: () =>
        request<{ data: RepresentativeCashBalance[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/admin/cash-balances', {
                params: pageParams,
            }),
        ),
    cashSubmissions: () =>
        request<{ data: CashSubmission[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/admin/cash-submissions', {
                params: pageParams,
            }),
        ),
    confirmSubmission: (id: number) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post(`api/admin/cash-submissions/${id}/confirm`, {}, { headers: headers() }),
        ),
    reverseSubmission: (id: number, reason: string) =>
        request<{ data: CashSubmission }>(() =>
            window.axios.post(`api/admin/cash-submissions/${id}/reverse`, { reason }, { headers: headers() }),
        ),
    creditBalances: () =>
        request<{ data: CustomerCreditBalance[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/admin/customer-credit-balances', {
                params: pageParams,
            }),
        ),
    paymentOptions: () => request<PaymentOptions>(() => window.axios.get('api/admin/customer-payment-options')),
    payments: () =>
        request<{ data: CustomerPayment[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/admin/customer-payments', {
                params: pageParams,
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
