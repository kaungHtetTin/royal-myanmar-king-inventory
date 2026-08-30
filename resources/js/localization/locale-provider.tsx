import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LocaleContext, type AppLocale, type TranslationParams } from './locale-context';
import { myanmarTranslations } from './translations';

const STORAGE_KEY = 'inventory.locale';
const intlLocales: Record<AppLocale, string> = { en: 'en-US', my: 'my-MM' };

function storedLocale(): AppLocale {
    if (typeof window === 'undefined') return 'en';

    return window.localStorage.getItem(STORAGE_KEY) === 'my' ? 'my' : 'en';
}

function interpolate(message: string, params?: TranslationParams) {
    if (!params) return message;

    return message.replace(/\{(\w+)\}/g, (match, key: string) =>
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
    );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, updateLocale] = useState<AppLocale>(storedLocale);

    const setLocale = useCallback((nextLocale: AppLocale) => {
        updateLocale(nextLocale);
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
    }, []);

    const toggleLocale = useCallback(() => {
        setLocale(locale === 'en' ? 'my' : 'en');
    }, [locale, setLocale]);

    useEffect(() => {
        document.documentElement.lang = locale;
        document.documentElement.dir = 'ltr';
        document.documentElement.dataset.locale = locale;
    }, [locale]);

    const value = useMemo(() => {
        const t = (key: string, params?: TranslationParams) => {
            const message = locale === 'my' ? (myanmarTranslations[key] ?? key) : key;
            return interpolate(message, params);
        };
        const formatNumber = (number: number, options?: Intl.NumberFormatOptions) =>
            new Intl.NumberFormat(intlLocales[locale], options).format(number);
        const formatDate = (date: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
            new Intl.DateTimeFormat(intlLocales[locale], options).format(new Date(date));
        const formatDateTime = (date: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
            new Intl.DateTimeFormat(intlLocales[locale], {
                dateStyle: 'medium',
                timeStyle: 'short',
                ...options,
            }).format(new Date(date));

        return { locale, setLocale, toggleLocale, t, formatNumber, formatDate, formatDateTime };
    }, [locale, setLocale, toggleLocale]);

    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
