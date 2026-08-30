import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';
const fontScalePercentStorageKey = 'inventory.font_scale_percent';
const legacyFontScaleStorageKey = 'inventory.font_scale';
const preferencesChangeEvent = 'inventory:preferences-change';

function preferredTheme(): Theme {
    const stored = window.localStorage.getItem('inventory.theme');

    if (stored === 'light' || stored === 'dark') {
        return stored;
    }

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function preferredDensity(): Density {
    return window.localStorage.getItem('inventory.density') === 'comfortable' ? 'comfortable' : 'compact';
}

function normalizeFontScalePercent(value: number) {
    return Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function preferredFontScalePercent() {
    const stored = window.localStorage.getItem(fontScalePercentStorageKey);
    if (stored !== null) return normalizeFontScalePercent(Number(stored));

    const legacyScale = Number(window.localStorage.getItem(legacyFontScaleStorageKey));
    return Number.isFinite(legacyScale) ? normalizeFontScalePercent((legacyScale - 1) * 200) : 0;
}

export function useUiPreferences() {
    const [theme, setTheme] = useState<Theme>(preferredTheme);
    const [density, setDensity] = useState<Density>(preferredDensity);
    const [fontScalePercent, setFontScalePercentState] = useState(preferredFontScalePercent);
    const fontScale = 1 + fontScalePercent / 200;

    useEffect(() => {
        const syncPreferences = () => setFontScalePercentState(preferredFontScalePercent());
        window.addEventListener('storage', syncPreferences);
        window.addEventListener(preferencesChangeEvent, syncPreferences);
        return () => {
            window.removeEventListener('storage', syncPreferences);
            window.removeEventListener(preferencesChangeEvent, syncPreferences);
        };
    }, []);

    useEffect(() => {
        window.localStorage.setItem('inventory.theme', theme);
        document.documentElement.style.colorScheme = theme;
    }, [theme]);

    useEffect(() => {
        window.localStorage.setItem('inventory.density', density);
    }, [density]);

    const setFontScalePercent = (value: number) => {
        const normalized = normalizeFontScalePercent(value);
        window.localStorage.setItem(fontScalePercentStorageKey, String(normalized));
        window.localStorage.removeItem(legacyFontScaleStorageKey);
        setFontScalePercentState(normalized);
        window.dispatchEvent(new Event(preferencesChangeEvent));
    };

    return {
        density,
        fontScale,
        fontScalePercent,
        setFontScalePercent,
        setDensity,
        setTheme,
        theme,
        toggleDensity: () => setDensity((value) => (value === 'compact' ? 'comfortable' : 'compact')),
        toggleTheme: () => setTheme((value) => (value === 'light' ? 'dark' : 'light')),
    };
}

export function useOnlineStatus() {
    const [online, setOnline] = useState(() => navigator.onLine);

    useEffect(() => {
        const markOnline = () => setOnline(true);
        const markOffline = () => setOnline(false);

        window.addEventListener('online', markOnline);
        window.addEventListener('offline', markOffline);

        return () => {
            window.removeEventListener('online', markOnline);
            window.removeEventListener('offline', markOffline);
        };
    }, []);

    return online;
}
