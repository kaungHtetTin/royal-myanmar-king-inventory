import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrandingContext, type Branding } from './branding-context';

const fallbackBranding: Branding = {
    business_name: 'StockFlow',
    business_tagline: 'Inventory & Sales',
    favicon_url: null,
    logo_url: null,
    primary_color: '#087f74',
};
const cacheKey = 'inventory.branding';

function cachedBranding() {
    try {
        return { ...fallbackBranding, ...(JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as Branding | null) };
    } catch {
        return fallbackBranding;
    }
}

function applyBranding(branding: Branding) {
    document.title = `${branding.business_name} · Stock & Inventory Management`;
    document.documentElement.style.setProperty('--brand-primary', branding.primary_color);
    const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (favicon) {
        favicon.dataset.defaultHref ||= favicon.href;
        favicon.href = branding.favicon_url ?? favicon.dataset.defaultHref;
    }
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = branding.primary_color;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
    const [branding, updateBranding] = useState<Branding>(cachedBranding);

    const setBranding = useCallback((next: Branding) => {
        updateBranding(next);
        localStorage.setItem(cacheKey, JSON.stringify(next));
        applyBranding(next);
    }, []);

    useEffect(() => {
        applyBranding(branding);
        let active = true;
        void window.axios
            .get<Branding>('api/branding')
            .then(({ data }) => {
                if (active && data?.business_name && data?.primary_color) setBranding(data);
            })
            .catch(() => {
                // Cached/default branding keeps the portals usable offline.
            });
        return () => {
            active = false;
        };
        // Branding is loaded once; settings updates call setBranding directly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const value = useMemo(() => ({ branding, setBranding }), [branding, setBranding]);
    return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}
