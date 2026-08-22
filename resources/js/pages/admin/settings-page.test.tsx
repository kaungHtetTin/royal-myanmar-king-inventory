import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionContext, type SessionContextValue } from '../../auth/session-context';
import { BrandingProvider } from '../../branding/branding-provider';
import '../../bootstrap';
import { SettingsPage } from './settings-page';

const user = {
    email: 'admin@example.com',
    id: 1,
    is_active: true,
    last_login_at: null,
    name: 'Admin User',
    permissions: ['role.manage'],
    roles: ['super-admin'],
    username: 'admin',
    warehouses: [],
};

const session: SessionContextValue = {
    login: vi.fn(),
    logout: vi.fn(),
    status: 'authenticated',
    updateUser: vi.fn(),
    user,
};

afterEach(() => vi.restoreAllMocks());

describe('application settings page', () => {
    it('loads the profile and exposes the inner settings navigation', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/branding') {
                return Promise.resolve({
                    data: {
                        business_name: 'StockFlow',
                        business_tagline: 'Inventory & Sales',
                        favicon_url: null,
                        logo_url: null,
                        primary_color: '#087f74',
                    },
                });
            }
            return Promise.resolve({
                data: {
                    branding: {
                        business_name: 'Valley Distribution',
                        business_tagline: 'Operations',
                        favicon_url: null,
                        logo_url: null,
                        primary_color: '#245e57',
                    },
                    operations: {
                        business_address: '',
                        business_email: '',
                        business_phone: '',
                        currency_code: 'MMK',
                        invoice_footer: '',
                        low_stock_threshold: 10,
                        timezone: 'Asia/Yangon',
                    },
                    profile: { email: user.email, id: user.id, name: user.name, username: user.username },
                },
            });
        });

        render(
            <BrandingProvider>
                <SessionContext.Provider value={session}>
                    <MemoryRouter>
                        <SettingsPage />
                    </MemoryRouter>
                </SessionContext.Provider>
            </BrandingProvider>,
        );

        expect(await screen.findByDisplayValue('Admin User')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Business branding/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Business branding/ }));
        expect(screen.getByRole('heading', { name: 'Business branding' })).toBeInTheDocument();
        expect(screen.getByDisplayValue('Valley Distribution')).toBeInTheDocument();
    });
});
