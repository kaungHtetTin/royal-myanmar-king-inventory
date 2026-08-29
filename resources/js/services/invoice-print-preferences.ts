import { invoicePaperSizes, type InvoicePaperSize } from './invoice-print';

const LEGACY_PAPER_PREFERENCE_KEY = 'stockflow.invoice-paper-size';

export function invoicePaperPreferenceKey(userId: number) {
    return `stockflow.invoice-paper-size.user-${userId}`;
}

export function configuredInvoicePaperSize(userId: number): InvoicePaperSize | null {
    const preferenceKey = invoicePaperPreferenceKey(userId);
    const userPreference = window.localStorage.getItem(preferenceKey);
    const saved = userPreference ?? window.localStorage.getItem(LEGACY_PAPER_PREFERENCE_KEY);
    const valid = invoicePaperSizes.some((option) => option.value === saved);

    if (!valid) return null;
    if (!userPreference && saved) {
        window.localStorage.setItem(preferenceKey, saved);
        window.localStorage.removeItem(LEGACY_PAPER_PREFERENCE_KEY);
    }
    return saved as InvoicePaperSize;
}

export function preferredInvoicePaperSize(userId: number): InvoicePaperSize {
    return configuredInvoicePaperSize(userId) ?? 'a4';
}
