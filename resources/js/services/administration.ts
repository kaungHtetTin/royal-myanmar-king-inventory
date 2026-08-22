import axios, { AxiosError } from 'axios';

export type WarehouseOption = { code: string; id: number; name: string };
export type RoleOption = { id: number; name: string };
export type PermissionOption = { id: number; name: string };

export type ManagedUser = {
    created_at: string | null;
    email: string;
    id: number;
    is_active: boolean;
    last_login_at: string | null;
    name: string;
    roles: string[];
    username: string;
    warehouses: WarehouseOption[];
};

export type ManagedRole = {
    id: number;
    name: string;
    permissions: string[];
    system: boolean;
    users_count: number;
};

export type AccessOptions = {
    permissions: PermissionOption[];
    roles: RoleOption[];
    warehouses: WarehouseOption[];
};

export type PaginationMeta = {
    current_page: number;
    from: number | null;
    last_page: number;
    per_page: number;
    to: number | null;
    total: number;
};

export type UserFilters = {
    page?: number;
    role?: string;
    search?: string;
    status?: string;
};
export type UserSummary = { active: number; roles: number; total: number; warehouse_assigned: number };

export type UserInput = {
    email: string;
    is_active: boolean;
    name: string;
    password?: string;
    password_confirmation?: string;
    roles?: string[];
    username: string;
    warehouse_ids?: number[];
};

export class AdministrationError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new AdministrationError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new AdministrationError(
        response?.data.message ?? 'Unable to complete the request.',
        response?.data.errors ?? {},
    );
}

async function request<T>(operation: () => Promise<{ data: T }>): Promise<T> {
    try {
        return (await operation()).data;
    } catch (error) {
        throw apiError(error);
    }
}

export const administrationApi = {
    accessOptions: () => request<AccessOptions>(() => window.axios.get('api/admin/access-options')),
    users: (filters: UserFilters) =>
        request<{ data: ManagedUser[]; meta: PaginationMeta; summary: UserSummary }>(() =>
            window.axios.get('api/admin/users', {
                params: { ...filters, per_page: 20 },
            }),
        ),
    roles: () => request<{ roles: ManagedRole[] }>(() => window.axios.get('api/admin/roles')),
    createUser: (input: UserInput) => request<{ data: ManagedUser }>(() => window.axios.post('api/admin/users', input)),
    updateUser: (id: number, input: UserInput) =>
        request<{ data: ManagedUser }>(() => window.axios.put(`api/admin/users/${id}`, input)),
    updateUserAccess: (id: number, input: { roles: string[]; warehouse_ids: number[] }) =>
        request<{ data: ManagedUser }>(() => window.axios.put(`api/admin/users/${id}/access`, input)),
    createRole: (input: { name: string; permissions: string[] }) =>
        request<{ role: ManagedRole }>(() => window.axios.post('api/admin/roles', input)),
    updateRole: (id: number, input: { name: string; permissions: string[] }) =>
        request<{ role: ManagedRole }>(() => window.axios.put(`api/admin/roles/${id}`, input)),
};
