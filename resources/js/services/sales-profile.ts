import axios, { AxiosError } from 'axios';

export type SalesProfile = {
    id: number;
    code: string;
    name: string;
    phone: string | null;
    email: string | null;
    region: string | null;
    is_active: boolean;
    primary_warehouse: { id: number; code: string; name: string };
    account: { id: number; name: string; username: string; email: string | null };
};

export type SalesProfileInput = {
    name: string;
    username: string;
    email: string;
    phone: string;
    region: string;
};

export class SalesProfileError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function profileError(error: unknown) {
    if (!axios.isAxiosError(error)) return new SalesProfileError('Unable to update your profile.');
    const response = (error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>).response;
    return new SalesProfileError(
        response?.data.message ?? 'Unable to update your profile.',
        response?.data.errors ?? {},
    );
}

async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw profileError(error);
    }
}

export const salesProfileApi = {
    get: () => request<{ representative: SalesProfile }>(() => window.axios.get('api/sales/profile')),
    update: (input: SalesProfileInput) =>
        request<{ representative: SalesProfile; user: SalesProfile['account'] }>(() =>
            window.axios.put('api/sales/profile', input),
        ),
    updatePassword: (input: { current_password: string; password: string; password_confirmation: string }) =>
        request<{ message: string }>(() => window.axios.put('api/sales/profile/password', input)),
};
