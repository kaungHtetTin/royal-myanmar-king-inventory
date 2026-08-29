import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrandingContext } from '../branding/branding-context';
import { SessionContext, type SessionUser } from '../auth/session-context';
import type { Sale } from '../services/sales';
import { invoicePaperPreferenceKey } from '../services/invoice-print-preferences';
import { InvoicePrintButton, PrintSettingsDialog } from './invoice-print-dialog';

const sale = {
    created_at: '2026-08-22T08:00:00.000Z',
    customer: { address: null, code: 'CUS-01', id: 1, name: 'Corner Shop', phone: null },
    id: 7,
    items: [
        {
            id: 1,
            line_total: 2500,
            product: { id: 1, name: 'Water', sku: 'W-01', unit: 'bottle' },
            quantity: 2,
            unit_price: 1250,
        },
    ],
    notes: null,
    payment_type: 'cash',
    posted_at: '2026-08-22T08:30:00.000Z',
    reference: 'SAL-000007',
    representative: { code: 'REP-01', id: 1, name: 'Ma Su' },
    status: 'posted',
    total_amount: 2500,
    total_quantity: 2,
    void_reason: null,
    voided_at: null,
    warehouse: { address: null, code: 'YGN', id: 1, name: 'Yangon', phone: null },
} as Sale;

const user: SessionUser = {
    email: null,
    id: 42,
    is_active: true,
    last_login_at: null,
    name: 'Ma Su',
    permissions: [],
    roles: ['sales-representative'],
    username: 'masu',
    warehouses: [],
};

function Providers({ children }: { children: ReactNode }) {
    return (
        <SessionContext.Provider
            value={{
                login: vi.fn(),
                logout: vi.fn(),
                status: 'authenticated',
                updateUser: vi.fn(),
                user,
            }}
        >
            <BrandingContext.Provider
                value={{
                    branding: {
                        business_name: 'StockFlow',
                        business_tagline: 'Inventory & Sales',
                        favicon_url: null,
                        logo_url: null,
                        primary_color: '#087f74',
                    },
                    setBranding: vi.fn(),
                }}
            >
                {children}
            </BrandingContext.Provider>
        </SessionContext.Provider>
    );
}

describe('invoice paper selector', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
    });

    it('offers every paper size and can save the selection as the default', () => {
        const write = vi.fn();
        const print = vi.fn();
        vi.spyOn(window, 'open').mockReturnValue({
            document: { close: vi.fn(), open: vi.fn(), write },
            focus: vi.fn(),
            opener: null,
            print,
        } as unknown as Window);
        vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
            if (typeof callback === 'function') callback();
            return 1;
        });

        render(
            <Providers>
                <div className="admin-root" data-density="compact" data-theme="light">
                    <table>
                        <tbody>
                            <tr>
                                <td>
                                    <InvoicePrintButton onBlocked={vi.fn()} sale={sale} />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Providers>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Print invoice' }));
        expect(screen.getByRole('dialog').parentElement?.parentElement).toBe(document.querySelector('.admin-root'));
        expect(document.querySelector('td [role="dialog"]')).toBeNull();
        expect(screen.getAllByRole('radio')).toHaveLength(5);
        expect(screen.getByRole('radio', { name: 'A4, 210 × 297 mm · full-page invoice' })).toBeChecked();

        fireEvent.click(screen.getByRole('radio', { name: '58 mm, Narrow thermal receipt' }));
        fireEvent.click(screen.getByRole('checkbox', { name: /Use as my default on this device/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Print on 58 mm' }));

        expect(window.localStorage.getItem(invoicePaperPreferenceKey(user.id))).toBe('58mm');
        expect(write).toHaveBeenCalledWith(expect.stringContaining('@page{size:58mm auto;margin:3mm}'));
        expect(print).toHaveBeenCalledOnce();
    });

    it('saves and applies a per-user default on this device', () => {
        const write = vi.fn();
        const print = vi.fn();
        vi.spyOn(window, 'open').mockReturnValue({
            document: { close: vi.fn(), open: vi.fn(), write },
            focus: vi.fn(),
            opener: null,
            print,
        } as unknown as Window);
        vi.spyOn(window, 'setTimeout').mockImplementation((callback) => {
            if (typeof callback === 'function') callback();
            return 1;
        });
        const { rerender } = render(
            <Providers>
                <PrintSettingsDialog onClose={vi.fn()} open />
            </Providers>,
        );

        fireEvent.click(screen.getByRole('radio', { name: '80 mm, Standard thermal receipt' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save default' }));
        expect(window.localStorage.getItem(invoicePaperPreferenceKey(user.id))).toBe('80mm');

        rerender(
            <Providers>
                <InvoicePrintButton onBlocked={vi.fn()} sale={sale} />
            </Providers>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Print invoice' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(write).toHaveBeenCalledWith(expect.stringContaining('@page{size:80mm auto;margin:3mm}'));
        expect(print).toHaveBeenCalledOnce();
    });
});
