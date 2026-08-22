import axios, { AxiosError } from 'axios';
import type { Branding } from '../branding/branding-context';

export type AdminProfile = { email: string | null; id: number; name: string; username: string };
export type OperationalSettings = {
    business_address: string | null;
    business_email: string | null;
    business_phone: string | null;
    currency_code: string;
    invoice_footer: string | null;
    low_stock_threshold: number;
    timezone: string;
};
export type ApplicationSettings = {
    branding: Branding;
    operations: OperationalSettings;
    profile: AdminProfile;
};
export type ProfileInput = {
    current_password: string;
    email: string;
    name: string;
    password: string;
    password_confirmation: string;
    username: string;
};
export type SettingsInput = OperationalSettings & {
    business_address: string;
    business_email: string;
    business_name: string;
    business_phone: string;
    business_tagline: string;
    favicon: File | null;
    invoice_footer: string;
    logo: File | null;
    primary_color: string;
    remove_favicon: boolean;
    remove_logo: boolean;
};

export class SettingsError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
    ) {
        super(message);
    }
}

function errorResponse(error: unknown) {
    if (!axios.isAxiosError(error)) return new SettingsError('Unable to save settings. Please try again.');
    const response = (error as AxiosError<{ errors?: Record<string, string[]>; message?: string }>).response;
    return new SettingsError(response?.data.message ?? 'Unable to save settings.', response?.data.errors ?? {});
}

async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw errorResponse(error);
    }
}

export const settingsApi = {
    get: () => request<ApplicationSettings>(() => window.axios.get('api/admin/settings')),
    updateProfile: (input: ProfileInput) =>
        request<{ profile: AdminProfile }>(() => window.axios.put('api/admin/settings/profile', input)),
    update: (input: SettingsInput) => {
        const data = new FormData();
        Object.entries(input).forEach(([key, value]) => {
            if (value instanceof File) data.append(key, value);
            else if (typeof value === 'boolean') data.append(key, value ? '1' : '0');
            else if (value !== null) data.append(key, String(value));
        });
        return request<{ branding: Branding; operations: OperationalSettings }>(() =>
            window.axios.post('api/admin/settings', data),
        );
    },
};
