import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Density = 'compact' | 'comfortable';

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

export function useUiPreferences() {
    const [theme, setTheme] = useState<Theme>(preferredTheme);
    const [density, setDensity] = useState<Density>(preferredDensity);

    useEffect(() => {
        window.localStorage.setItem('inventory.theme', theme);
        document.documentElement.style.colorScheme = theme;
    }, [theme]);

    useEffect(() => {
        window.localStorage.setItem('inventory.density', density);
    }, [density]);

    return {
        density,
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
