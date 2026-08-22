import { createContext, useContext } from 'react';

export type Branding = {
    business_address?: string | null;
    business_email?: string | null;
    business_name: string;
    business_phone?: string | null;
    business_tagline: string | null;
    currency_code?: string;
    favicon_url: string | null;
    invoice_footer?: string | null;
    logo_url: string | null;
    primary_color: string;
};

export type BrandingContextValue = {
    branding: Branding;
    setBranding: (branding: Branding) => void;
};

export const BrandingContext = createContext<BrandingContextValue | null>(null);

export function useBranding() {
    const context = useContext(BrandingContext);
    if (!context) throw new Error('useBranding must be used inside BrandingProvider.');
    return context;
}
