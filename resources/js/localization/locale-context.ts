import { createContext, useContext } from 'react';

export type AppLocale = 'en' | 'my';
export type TranslationParams = Record<string, string | number>;

export type LocaleContextValue = {
    locale: AppLocale;
    setLocale: (locale: AppLocale) => void;
    toggleLocale: () => void;
    t: (key: string, params?: TranslationParams) => string;
    formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
    formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
    formatDateTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
};

const defaultContext: LocaleContextValue = {
    locale: 'en',
    setLocale: () => undefined,
    toggleLocale: () => undefined,
    t: (key, params) =>
        params
            ? key.replace(/\{(\w+)\}/g, (match, name: string) =>
                  Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
              )
            : key,
    formatNumber: (value, options) => new Intl.NumberFormat('en-US', options).format(value),
    formatDate: (value, options) => new Intl.DateTimeFormat('en-US', options).format(new Date(value)),
    formatDateTime: (value, options) =>
        new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', ...options }).format(
            new Date(value),
        ),
};

export const LocaleContext = createContext<LocaleContextValue>(defaultContext);

export function useLocale() {
    const context = useContext(LocaleContext);

    return context;
}
