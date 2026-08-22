import { fireEvent, render, screen } from '@testing-library/react';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Root from './root';
import type { SessionUser } from './auth/session-context';

const baseUser: SessionUser = {
    email: 'admin@stockflow.local',
    id: 1,
    is_active: true,
    last_login_at: null,
    name: 'Super Admin',
    permissions: [],
    roles: ['super-admin'],
    username: 'superadmin',
    warehouses: [],
};

const representativeUser: SessionUser = {
    ...baseUser,
    email: 'koaung@example.com',
    id: 2,
    name: 'Ko Aung',
    roles: ['sales-representative'],
    username: 'koaung',
};

describe('application portals', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.axios = axios;
        vi.restoreAllMocks();
    });

    it('renders the admin shell on an admin route', () => {
        render(
            <MemoryRouter initialEntries={['/admin/dashboard']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Operations overview' })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument();
    });

    it('loads the user and role administration workspace', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/access-options')
                return Promise.resolve({
                    data: {
                        permissions: [],
                        roles: [{ id: 1, name: 'super-admin' }],
                        warehouses: [],
                    },
                });
            if (url === 'api/admin/roles')
                return Promise.resolve({
                    data: {
                        roles: [
                            {
                                id: 1,
                                name: 'super-admin',
                                permissions: [],
                                system: true,
                                users_count: 1,
                            },
                        ],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            created_at: '2026-08-17T00:00:00Z',
                            email: 'admin@stockflow.local',
                            id: 1,
                            is_active: true,
                            last_login_at: null,
                            name: 'Super Admin',
                            roles: ['super-admin'],
                            username: 'superadmin',
                            warehouses: [],
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/users']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Users & roles' })).toBeInTheDocument();
        expect(await screen.findByText(/admin@stockflow\.local/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Roles 1' }));
        expect(screen.getByRole('heading', { name: 'Roles & permissions' })).toBeInTheDocument();
    });

    it('loads warehouse management and opens the creation dialog', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                data: [
                    {
                        address: 'No. 12, Main Road',
                        code: 'YGN-MAIN',
                        created_at: '2026-08-17T00:00:00Z',
                        id: 1,
                        is_active: true,
                        name: 'Yangon Main Warehouse',
                        notes: null,
                        phone: '09-123456789',
                        region: 'Yangon',
                        township: 'Hlaing',
                        updated_at: '2026-08-17T00:00:00Z',
                        users_count: 2,
                    },
                ],
                meta: {
                    current_page: 1,
                    from: 1,
                    last_page: 1,
                    per_page: 20,
                    to: 1,
                    total: 1,
                },
            },
        });

        render(
            <MemoryRouter initialEntries={['/admin/warehouses']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Warehouses' })).toBeInTheDocument();
        expect(await screen.findByText('Yangon Main Warehouse')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New warehouse' }));
        expect(screen.getByRole('dialog', { name: 'Create warehouse' })).toBeInTheDocument();
    });

    it('loads product management and opens the creation dialog', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/product-options')
                return Promise.resolve({
                    data: { categories: ['Drinking Water'], units: ['bottle'] },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            barcode: '8850000000011',
                            category: 'Drinking Water',
                            created_at: '2026-08-17T00:00:00Z',
                            description: null,
                            id: 1,
                            is_active: true,
                            name: 'Drinking Water 1 Litre',
                            selling_price: 1000,
                            sku: 'DW-1L',
                            unit: 'bottle',
                            updated_at: '2026-08-17T00:00:00Z',
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/products']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument();
        expect(await screen.findByText('Drinking Water 1 Litre')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New product' }));
        expect(screen.getByRole('dialog', { name: 'Create product' })).toBeInTheDocument();
    });

    it('loads warehouse inventory and opens transaction draft dialogs', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/inventory/options')
                return Promise.resolve({
                    data: {
                        movement_types: ['IMPORT_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL_OUT'],
                        products: [
                            {
                                id: 1,
                                name: 'Drinking Water 1 Litre',
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                        ],
                        warehouses: [
                            {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main Warehouse',
                            },
                        ],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            id: 1,
                            product: {
                                id: 1,
                                name: 'Drinking Water 1 Litre',
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                            quantity: 240,
                            updated_at: '2026-08-17T00:00:00Z',
                            warehouse: {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main Warehouse',
                            },
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/inventory']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Warehouse inventory' })).toBeInTheDocument();
        expect(await screen.findByText('Drinking Water 1 Litre')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New import' }));
        expect(screen.getByRole('dialog', { name: 'Create stock import' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'New adjustment' }));
        expect(screen.getByRole('dialog', { name: 'Create stock adjustment' })).toBeInTheDocument();
    });

    it('loads transfer management and opens a warehouse transfer draft', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/warehouse-transfer-options')
                return Promise.resolve({
                    data: {
                        destination_warehouses: [
                            {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main Warehouse',
                            },
                            {
                                code: 'MDY-MAIN',
                                id: 2,
                                name: 'Mandalay Main Warehouse',
                            },
                        ],
                        products: [
                            {
                                id: 1,
                                name: 'Drinking Water 1 Litre',
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                        ],
                        source_warehouses: [
                            {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main Warehouse',
                            },
                        ],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            cancel_reason: null,
                            cancelled_at: null,
                            cancelled_by: null,
                            created_at: '2026-08-17T00:00:00Z',
                            created_by: { id: 1, name: 'Super Admin' },
                            destination_warehouse: {
                                code: 'MDY-MAIN',
                                id: 2,
                                name: 'Mandalay Main Warehouse',
                            },
                            dispatched_at: '2026-08-17T00:10:00Z',
                            dispatched_by: { id: 1, name: 'Super Admin' },
                            id: 1,
                            items: [
                                {
                                    id: 1,
                                    in_transit_quantity: 24,
                                    product: {
                                        id: 1,
                                        name: 'Drinking Water 1 Litre',
                                        sku: 'DW-1L',
                                        unit: 'bottle',
                                    },
                                    quantity: 24,
                                },
                            ],
                            notes: 'Transfer',
                            received_at: null,
                            received_by: null,
                            reference: 'WTR-000001',
                            reversal_reason: null,
                            reversed_at: null,
                            reversed_by: null,
                            source_warehouse: {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main Warehouse',
                            },
                            status: 'dispatched',
                            total_quantity: 24,
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/transfers']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Transfers' })).toBeInTheDocument();
        expect(await screen.findByText('WTR-000001')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New warehouse transfer' }));
        expect(screen.getByRole('dialog', { name: 'Create warehouse transfer' })).toBeInTheDocument();
    });

    it('loads representative stock and pending receiving in the sales app', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/receivings')
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                cancel_reason: null,
                                cancelled_at: null,
                                cancelled_by: null,
                                created_at: '2026-08-17T00:00:00Z',
                                created_by: { id: 1, name: 'Super Admin' },
                                dispatched_at: '2026-08-17T00:10:00Z',
                                dispatched_by: { id: 1, name: 'Super Admin' },
                                id: 1,
                                items: [
                                    {
                                        id: 1,
                                        in_transit_quantity: 20,
                                        product: {
                                            id: 1,
                                            name: 'Drinking Water 1 Litre',
                                            sku: 'DW-1L',
                                            unit: 'bottle',
                                        },
                                        quantity: 20,
                                    },
                                ],
                                notes: null,
                                received_at: null,
                                received_by: null,
                                reference: 'RTR-000002',
                                representative: {
                                    code: 'SR-001',
                                    id: 1,
                                    name: 'Ko Aung',
                                },
                                reversal_reason: null,
                                reversed_at: null,
                                reversed_by: null,
                                source_warehouse: {
                                    code: 'YGN-MAIN',
                                    id: 1,
                                    name: 'Yangon Main Warehouse',
                                },
                                status: 'dispatched',
                                total_quantity: 20,
                            },
                        ],
                        meta: {
                            current_page: 1,
                            from: 1,
                            last_page: 1,
                            per_page: 20,
                            to: 1,
                            total: 1,
                        },
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            capacity_remaining: 10,
                            id: 1,
                            pending_quantity: 20,
                            product: {
                                id: 1,
                                name: 'Drinking Water 1 Litre',
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                            quantity: 70,
                            representative: {
                                code: 'SR-001',
                                id: 1,
                                name: 'Ko Aung',
                            },
                            updated_at: '2026-08-17T00:00:00Z',
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 50,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/sales/my-stock']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'My stock' })).toBeInTheDocument();
        expect(await screen.findByText('RTR-000002')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm all received' })).toBeInTheDocument();
    });

    it('loads the representative sale-entry workflow with stock and credit previews', async () => {
        const post = vi.spyOn(axios, 'post');
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/sale-options')
                return Promise.resolve({
                    data: {
                        cash_hold: 5000,
                        representative: {
                            code: 'SR-001',
                            id: 1,
                            name: 'Ko Aung',
                        },
                        customers: [
                            {
                                available_credit: 7500,
                                code: 'CUS-ABC',
                                credit_allowed: true,
                                credit_limit: 10000,
                                id: 1,
                                name: 'ABC Shop',
                                outstanding_amount: 2500,
                            },
                            {
                                available_credit: 0,
                                code: 'CUS-CASH',
                                credit_allowed: false,
                                credit_limit: 0,
                                id: 2,
                                name: 'Cash Corner',
                                outstanding_amount: 0,
                            },
                        ],
                        products: [
                            {
                                id: 1,
                                name: 'Drinking Water 1 Litre',
                                quantity: 20,
                                selling_price: 1000,
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                        ],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [],
                    meta: {
                        current_page: 1,
                        from: null,
                        last_page: 1,
                        per_page: 20,
                        to: null,
                        total: 0,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/sales/new-sale']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'New sale' })).toBeInTheDocument();
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
        const customerSearch = await screen.findByRole('combobox', { name: 'Customer' });
        expect(customerSearch).toHaveValue('');
        expect(screen.getByRole('heading', { name: 'Information' })).toBeInTheDocument();
        expect(screen.getByText('Credit availability will appear here.')).toBeInTheDocument();

        fireEvent.change(customerSearch, { target: { value: 'ABC' } });
        fireEvent.click(screen.getByRole('option', { name: /ABC Shop/ }));
        expect(customerSearch).toHaveValue('CUS-ABC · ABC Shop');
        expect(screen.getByRole('region', { name: 'Customer credit status' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Credit available: Yes' })).toBeInTheDocument();
        expect(screen.getByText('7,500 MMK')).toBeInTheDocument();

        fireEvent.change(customerSearch, { target: { value: 'Cash Corner' } });
        fireEvent.click(screen.getByRole('option', { name: /Cash Corner/ }));
        expect(screen.getByRole('img', { name: 'Credit available: No' })).toBeInTheDocument();

        fireEvent.change(customerSearch, { target: { value: 'ABC Shop' } });
        fireEvent.click(screen.getByRole('option', { name: /ABC Shop/ }));
        fireEvent.click(screen.getByRole('radio', { name: 'Credit' }));
        expect(screen.getByRole('radio', { name: 'Credit' })).toBeChecked();
        fireEvent.click(screen.getByRole('button', { name: 'Continue to products' }));

        expect(screen.getByRole('heading', { name: 'Products' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Select Drinking Water 1 Litre' }));
        fireEvent.click(screen.getByRole('button', { name: 'Continue to quantity' }));

        expect(screen.getByRole('heading', { name: 'Quantity' })).toBeInTheDocument();
        const quantity = screen.getByLabelText('Quantity for Drinking Water 1 Litre');
        expect(quantity.closest('label')).not.toHaveTextContent('Quantity');
        fireEvent.change(quantity, {
            target: { value: '21' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Review sale' }));
        expect(await screen.findByText('Only 20 units are currently available.')).toBeInTheDocument();

        fireEvent.change(quantity, { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review sale' }));
        expect(screen.getByRole('heading', { name: 'Review & submit' })).toBeInTheDocument();
        expect(screen.queryByText('Server preview')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Sale summary' })).not.toBeInTheDocument();
        expect(screen.queryByText(/7,500 MMK available/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit information' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Post sale' })).toBeInTheDocument();
        expect(post).not.toHaveBeenCalled();
    });

    it('shows draft sale actions in a right-aligned history menu', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/sale-options')
                return Promise.resolve({
                    data: {
                        cash_hold: 1400,
                        customers: [
                            {
                                available_credit: 10000,
                                code: 'CUS-ABC',
                                credit_allowed: true,
                                credit_limit: 10000,
                                id: 1,
                                name: 'ABC Shop',
                                outstanding_amount: 0,
                            },
                        ],
                        products: [
                            {
                                id: 1,
                                name: 'Drinking Water 1 Litre',
                                quantity: 20,
                                selling_price: 1000,
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                        ],
                        representative: { code: 'SR-001', id: 1, name: 'Ko Aung' },
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            created_at: '2026-08-17T07:45:00Z',
                            customer: { code: 'CUS-ABC', id: 1, name: 'ABC Shop' },
                            id: 3,
                            items: [
                                {
                                    id: 1,
                                    line_total: 1000,
                                    product: {
                                        id: 1,
                                        name: 'Drinking Water 1 Litre',
                                        sku: 'DW-1L',
                                        unit: 'bottle',
                                    },
                                    quantity: 1,
                                    unit_price: 1000,
                                },
                            ],
                            notes: null,
                            payment_type: 'cash',
                            posted_at: null,
                            reference: 'SAL-000003',
                            representative: { code: 'SR-001', id: 1, name: 'Ko Aung' },
                            status: 'draft',
                            total_amount: 1000,
                            total_quantity: 1,
                            void_reason: null,
                            voided_at: null,
                            warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Main Warehouse' },
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/sales/sales-history']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Sales history' })).toBeInTheDocument();
        const trigger = await screen.findByRole('button', { name: 'Actions for SAL-000003' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menu', { name: 'Actions for SAL-000003' })).not.toBeInTheDocument();

        fireEvent.click(trigger);
        expect(trigger).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menuitem', { name: 'View' })).toHaveAttribute('href', '/sales/sales-history/3');
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Post' })).toBeInTheDocument();

        trigger.focus();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
        expect(trigger).toHaveFocus();

        fireEvent.click(trigger);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
        expect(await screen.findByRole('heading', { name: 'Edit SAL-000003' })).toBeInTheDocument();
    });

    it('opens a representative sale history record on its own detail page', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/sales/3')
                return Promise.resolve({
                    data: {
                        data: {
                            created_at: '2026-08-17T07:45:00Z',
                            customer: { code: 'CUS-ABC', id: 1, name: 'ABC Shop' },
                            id: 3,
                            items: [
                                {
                                    id: 1,
                                    line_total: 2000,
                                    product: {
                                        id: 1,
                                        name: 'Drinking Water 1 Litre',
                                        sku: 'DW-1L',
                                        unit: 'bottle',
                                    },
                                    quantity: 2,
                                    unit_price: 1000,
                                },
                            ],
                            notes: 'Deliver before noon',
                            payment_type: 'cash',
                            posted_at: null,
                            reference: 'SAL-000003',
                            representative: { code: 'SR-001', id: 1, name: 'Ko Aung' },
                            status: 'draft',
                            total_amount: 2000,
                            total_quantity: 2,
                            void_reason: null,
                            voided_at: null,
                            warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Main Warehouse' },
                        },
                    },
                });
            return Promise.reject(new Error(`Unexpected GET ${url}`));
        });

        render(
            <MemoryRouter initialEntries={['/sales/sales-history/3']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'SAL-000003' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Sales history' })).toHaveAttribute('href', '/sales/sales-history');
        expect(screen.getByRole('heading', { name: 'Sale information' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Line items' })).toBeInTheDocument();
        expect(screen.getByText('Drinking Water 1 Litre')).toBeInTheDocument();
        expect(screen.getByText('Deliver before noon')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Edit draft' })).toHaveAttribute('href', '/sales/new-sale?edit=3');
    });

    it('loads the warehouse-scoped admin sales register', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                data: [
                    {
                        created_at: '2026-08-17T00:00:00Z',
                        customer: { code: 'CUS-ABC', id: 1, name: 'ABC Shop' },
                        id: 1,
                        items: [
                            {
                                id: 1,
                                line_total: 5000,
                                product: {
                                    id: 1,
                                    name: 'Drinking Water 1 Litre',
                                    sku: 'DW-1L',
                                    unit: 'bottle',
                                },
                                quantity: 5,
                                unit_price: 1000,
                            },
                        ],
                        notes: null,
                        payment_type: 'cash',
                        posted_at: '2026-08-17T00:01:00Z',
                        reference: 'SAL-000001',
                        representative: {
                            code: 'SR-001',
                            id: 1,
                            name: 'Ko Aung',
                        },
                        status: 'posted',
                        total_amount: 5000,
                        total_quantity: 5,
                        void_reason: null,
                        voided_at: null,
                        warehouse: {
                            code: 'YGN-MAIN',
                            id: 1,
                            name: 'Yangon Main Warehouse',
                        },
                    },
                ],
                meta: {
                    current_page: 1,
                    from: 1,
                    last_page: 1,
                    per_page: 20,
                    to: 1,
                    total: 1,
                },
            },
        });

        render(
            <MemoryRouter initialEntries={['/admin/sales']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Sales' })).toBeInTheDocument();
        expect(await screen.findByText('SAL-000001')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Void SAL-000001' })).toBeInTheDocument();
    });

    it('loads vehicle management and opens the creation dialog', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/vehicle-options')
                return Promise.resolve({
                    data: { representatives: [], types: ['Van'] },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            brand: 'Toyota',
                            created_at: '2026-08-17T00:00:00Z',
                            id: 1,
                            is_active: true,
                            model: 'Hiace',
                            notes: null,
                            representative: null,
                            sales_representative_id: null,
                            updated_at: '2026-08-17T00:00:00Z',
                            vehicle_number: 'YGN-3N-4821',
                            vehicle_type: 'Van',
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/vehicles']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Vehicles' })).toBeInTheDocument();
        expect(await screen.findByText('YGN-3N-4821')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New vehicle' }));
        expect(screen.getByRole('dialog', { name: 'Create vehicle' })).toBeInTheDocument();
    });

    it('loads customer management and opens the creation dialog', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/customer-options')
                return Promise.resolve({
                    data: {
                        types: ['Shop'],
                        warehouses: [{ code: 'YGN', id: 1, name: 'Yangon Warehouse' }],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            address: null,
                            code: 'CUS-ABC',
                            created_at: '2026-08-17T00:00:00Z',
                            credit_allowed: true,
                            credit_limit: 2000000,
                            customer_type: 'Shop',
                            id: 1,
                            is_active: true,
                            name: 'ABC Shop',
                            notes: null,
                            phone: '09-123456789',
                            region: 'Yangon',
                            township: 'Hlaing',
                            updated_at: '2026-08-17T00:00:00Z',
                            warehouse: {
                                code: 'YGN',
                                id: 1,
                                name: 'Yangon Warehouse',
                            },
                            warehouse_id: 1,
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/customers']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Customers' })).toBeInTheDocument();
        expect(await screen.findByText('ABC Shop')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New customer' }));
        expect(screen.getByRole('dialog', { name: 'Create customer' })).toBeInTheDocument();
    });

    it('loads representative management and opens the creation dialog', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/representative-options')
                return Promise.resolve({
                    data: {
                        vehicles: [],
                        warehouses: [{ code: 'YGN', id: 1, name: 'Yangon Warehouse' }],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            account: {
                                email: null,
                                id: 2,
                                is_active: true,
                                last_login_at: null,
                                username: 'koaung',
                            },
                            code: 'SR-001',
                            created_at: '2026-08-17T00:00:00Z',
                            email: null,
                            id: 1,
                            is_active: true,
                            name: 'Ko Aung',
                            notes: null,
                            phone: '09-123456789',
                            primary_warehouse: {
                                code: 'YGN',
                                id: 1,
                                name: 'Yangon Warehouse',
                            },
                            primary_warehouse_id: 1,
                            region: 'Yangon',
                            updated_at: '2026-08-17T00:00:00Z',
                            vehicle: null,
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 20,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/representatives']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Representatives' })).toBeInTheDocument();
        expect(await screen.findByText('Ko Aung')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New representative' }));
        expect(screen.getByRole('dialog', { name: 'Create representative' })).toBeInTheDocument();
    });

    it('renders the representative shell on a sales route', async () => {
        render(
            <MemoryRouter initialEntries={['/sales/dashboard']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Route overview' })).toBeInTheDocument();
        expect(
            screen.getAllByRole('navigation', {
                name: 'Representative navigation',
            }),
        ).toHaveLength(2);
        expect(screen.getByRole('link', { name: 'StockFlow home' })).toHaveAttribute('href', '/sales/dashboard');
    });

    it('opens and dismisses the representative profile menu', async () => {
        render(
            <MemoryRouter initialEntries={['/sales/dashboard']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Route overview' })).toBeInTheDocument();
        const profileButton = screen.getByRole('button', { name: 'Profile menu' });
        expect(profileButton).toHaveAttribute('aria-expanded', 'false');

        fireEvent.click(profileButton);
        expect(profileButton).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('menu', { name: 'Profile options' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Use dark theme' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Use comfortable density' })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(profileButton).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByRole('menu', { name: 'Profile options' })).not.toBeInTheDocument();
    });

    it('keeps navigation inside a nested deployment directory', () => {
        render(
            <MemoryRouter basename="/inventory/public" initialEntries={['/inventory/public/admin/login']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(screen.getByRole('link', { name: 'Representative app' })).toHaveAttribute(
            'href',
            '/inventory/public/sales/dashboard',
        );
    });

    it('persists theme and density preferences on the admin shell', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/admin/dashboard']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        const shell = container.querySelector('.admin-root');

        fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Use dark theme' }));
        fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Use comfortable density' }));

        expect(shell).toHaveAttribute('data-theme', 'dark');
        expect(shell).toHaveAttribute('data-density', 'comfortable');
        expect(window.localStorage.getItem('inventory.theme')).toBe('dark');
        expect(window.localStorage.getItem('inventory.density')).toBe('comfortable');
    });

    it('opens and dismisses the admin navigation drawer', () => {
        render(
            <MemoryRouter initialEntries={['/admin/dashboard']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        const menuButton = screen.getByRole('button', {
            name: 'Open navigation',
        });
        const sidebar = screen.getByRole('complementary', {
            name: 'Admin sidebar',
        });

        expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(menuButton);
        expect(menuButton).toHaveAttribute('aria-expanded', 'true');
        expect(sidebar).toHaveClass('is-open');

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        expect(sidebar).not.toHaveClass('is-open');
    });

    it('keeps only the collapse state control in the sidebar footer', () => {
        const { container } = render(
            <MemoryRouter initialEntries={['/admin/dashboard']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

        expect(container.querySelector('.admin-root')).toHaveAttribute('data-sidebar', 'collapsed');
        expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument();
        expect(container.querySelector('.admin-sidebar__footer a')).not.toBeInTheDocument();
    });

    it('renders separate login experiences for each portal', () => {
        const { unmount } = render(
            <MemoryRouter initialEntries={['/admin/login']}>
                <Root initialUser={null} />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Office sign in' })).toBeInTheDocument();
        unmount();

        render(
            <MemoryRouter initialEntries={['/sales/login']}>
                <Root initialUser={null} />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Route sign in' })).toBeInTheDocument();
    });

    it('loads the representative cash workspace and opens submission entry', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/cash-hold')
                return Promise.resolve({
                    data: {
                        available_to_submit: 400,
                        cash_hold: 1400,
                        pending_submissions: 1000,
                        representative: {
                            code: 'SR-001',
                            id: 1,
                            name: 'Ko Aung',
                        },
                        transactions: [
                            {
                                actor: { id: 2, name: 'Ko Aung' },
                                amount_delta: 5400,
                                id: 1,
                                notes: null,
                                occurred_at: '2026-08-17T00:00:00Z',
                                reference: 'SAL-000001',
                                type: 'cash_sale',
                            },
                        ],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            amount: 1000,
                            cancel_reason: null,
                            cancelled_at: null,
                            cancelled_by: null,
                            confirmed_at: null,
                            confirmed_by: null,
                            created_at: '2026-08-17T00:00:00Z',
                            created_by: { id: 2, name: 'Ko Aung' },
                            id: 1,
                            notes: 'Handover',
                            reference: 'CSB-000002',
                            representative: {
                                code: 'SR-001',
                                id: 1,
                                name: 'Ko Aung',
                            },
                            reversal_reason: null,
                            reversed_at: null,
                            reversed_by: null,
                            status: 'pending',
                            warehouse: {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main',
                            },
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 50,
                        to: 1,
                        total: 1,
                    },
                },
            });
        });
        render(
            <MemoryRouter initialEntries={['/sales/cash-hold']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Cash hold' })).toBeInTheDocument();
        expect(await screen.findByText('CSB-000002')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Submit cash' }));
        expect(screen.getByRole('dialog', { name: 'Submit cash' })).toBeInTheDocument();
    });

    it('loads the office finance workspace and opens payment entry', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            const meta = {
                current_page: 1,
                from: 1,
                last_page: 1,
                per_page: 50,
                to: 1,
                total: 1,
            };
            if (url === 'api/admin/cash-balances')
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                available_to_submit: 400,
                                cash_hold: 1400,
                                code: 'SR-001',
                                id: 1,
                                name: 'Ko Aung',
                                pending_submissions: 1000,
                                warehouse: {
                                    code: 'YGN-MAIN',
                                    id: 1,
                                    name: 'Yangon Main',
                                },
                            },
                        ],
                        meta,
                    },
                });
            if (url === 'api/admin/cash-submissions')
                return Promise.resolve({
                    data: {
                        data: [],
                        meta: { ...meta, from: null, to: null, total: 0 },
                    },
                });
            if (url === 'api/admin/customer-credit-balances')
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                code: 'CUS-ABC',
                                credit_limit: 10000,
                                id: 1,
                                is_active: true,
                                name: 'ABC Shop',
                                outstanding_amount: 700,
                                warehouse: {
                                    code: 'YGN-MAIN',
                                    id: 1,
                                    name: 'Yangon Main',
                                },
                            },
                        ],
                        meta,
                    },
                });
            if (url === 'api/admin/customer-payments')
                return Promise.resolve({
                    data: {
                        data: [],
                        meta: { ...meta, from: null, to: null, total: 0 },
                    },
                });
            return Promise.resolve({
                data: {
                    customers: [
                        {
                            code: 'CUS-ABC',
                            id: 1,
                            name: 'ABC Shop',
                            outstanding_amount: 700,
                            warehouse_id: 1,
                        },
                    ],
                    payment_methods: ['cash', 'bank_transfer'],
                    warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main' }],
                },
            });
        });
        render(
            <MemoryRouter initialEntries={['/admin/cash']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Cash & credit' })).toBeInTheDocument();
        expect(await screen.findByText('Ko Aung')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
        expect(screen.getByRole('dialog', { name: 'Record customer payment' })).toBeInTheDocument();
    });

    it('renders live warehouse-scoped admin dashboard metrics', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                as_of: '2026-08-17T08:00:00Z',
                kpis: {
                    active_representatives: 2,
                    customer_outstanding: 700,
                    pending_cash_submissions: 1,
                    pending_representative_receivings: 1,
                    pending_warehouse_transfers: 1,
                    products: 3,
                    representative_cash: 1400,
                    today_cash_sales: 5400,
                    today_credit_sales: 2700,
                    today_sales: 8100,
                    warehouse_stock: 860,
                },
                recent_movements: [
                    {
                        actor: { id: 1, name: 'Super Admin' },
                        id: 1,
                        occurred_at: '2026-08-17T08:00:00Z',
                        product: {
                            id: 1,
                            name: 'Water 1L',
                            sku: 'DW-1L',
                            unit: 'bottle',
                        },
                        quantity: 10,
                        reference: 'IMP-000001',
                        type: 'IMPORT_IN',
                    },
                ],
                selected_warehouse_id: null,
                warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main Warehouse' }],
            },
        });
        render(
            <MemoryRouter initialEntries={['/admin/dashboard']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByText('8,100 MMK')).toBeInTheDocument();
        expect(await screen.findByText('IMP-000001')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Warehouse scope' })).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: 'Transfers, 2 actions need attention' })).toBeInTheDocument();
        expect(
            await screen.findByRole('link', { name: 'Cash & credit, 1 action needs attention' }),
        ).toBeInTheDocument();
    });

    it('loads the multi-report workspace with posted-only sales totals', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/report-options')
                return Promise.resolve({
                    data: {
                        categories: [],
                        customers: [],
                        products: [],
                        regions: [],
                        reports: ['warehouse-stock', 'sales'],
                        representatives: [],
                        warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main' }],
                    },
                });
            return Promise.resolve({
                data: {
                    data: [
                        {
                            id: 1,
                            product: {
                                category: 'Water',
                                id: 1,
                                name: 'Water 1L',
                                sku: 'DW-1L',
                                unit: 'bottle',
                            },
                            quantity: 860,
                            warehouse: {
                                code: 'YGN-MAIN',
                                id: 1,
                                name: 'Yangon Main',
                            },
                        },
                    ],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 1,
                        per_page: 25,
                        to: 1,
                        total: 1,
                    },
                    report: 'warehouse-stock',
                    rules: { financial_totals: 'posted_only' },
                    summary: { products: 1, units: 860 },
                },
            });
        });
        render(
            <MemoryRouter initialEntries={['/admin/reports']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
        expect(await screen.findByText('Water 1L')).toBeInTheDocument();
        expect(screen.getByText('860', { selector: '.metric-card strong' })).toBeInTheDocument();
    });

    it('loads searchable audit history with changes and source links', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                data: [
                    {
                        action: 'credit_updated',
                        actor: {
                            id: 1,
                            name: 'Super Admin',
                            username: 'superadmin',
                        },
                        created_at: '2026-08-17T08:00:00Z',
                        event: 'customer.credit_updated',
                        id: 1,
                        ip_address: '127.0.0.1',
                        metadata: {
                            new: { credit_limit: 2000 },
                            old: { credit_limit: 1000 },
                        },
                        module: 'customer',
                        new: { credit_limit: 2000 },
                        old: { credit_limit: 1000 },
                        subject_id: 1,
                        subject_type: 'Customer',
                        subject_url: '/admin/customers',
                    },
                ],
                filters: {
                    actors: [{ id: 1, name: 'Super Admin', username: 'superadmin' }],
                    modules: ['customer'],
                    warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main' }],
                },
                meta: {
                    current_page: 1,
                    from: 1,
                    last_page: 1,
                    per_page: 25,
                    to: 1,
                    total: 1,
                },
            },
        });
        render(
            <MemoryRouter initialEntries={['/admin/audit-logs']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Audit log' })).toBeInTheDocument();
        expect(await screen.findByText('credit updated')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open source for audit 1' })).toHaveAttribute(
            'href',
            '/admin/customers',
        );
    });

    it('renders the representative dashboard from owned live data', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                as_of: '2026-08-17T08:00:00Z',
                kpis: {
                    cash_hold: 1400,
                    pending_receivings: 1,
                    stock_products: 1,
                    stock_units: 17,
                    today_cash_sales: 5400,
                    today_credit_sales: 2700,
                    today_sales: 8100,
                },
                pending_receivings: [
                    {
                        dispatched_at: '2026-08-17T07:00:00Z',
                        id: 1,
                        products: 1,
                        reference: 'RTR-000001',
                        total_quantity: 10,
                        warehouse: {
                            code: 'YGN-MAIN',
                            id: 1,
                            name: 'Yangon Main',
                        },
                    },
                ],
                recent_sales: [
                    {
                        created_at: '2026-08-17T07:30:00Z',
                        customer: { code: 'CUS-ABC', id: 1, name: 'ABC Shop' },
                        id: 2,
                        payment_type: 'cash',
                        reference: 'SAL-000002',
                        status: 'posted',
                        total_amount: 5400,
                        total_quantity: 6,
                    },
                ],
                representative: { code: 'SR-001', id: 1, name: 'Ko Aung' },
                stock: [
                    {
                        id: 1,
                        product: {
                            id: 1,
                            name: 'Water 1L',
                            sku: 'DW-1L',
                            unit: 'bottle',
                        },
                        quantity: 17,
                    },
                ],
            },
        });
        render(
            <MemoryRouter initialEntries={['/sales/dashboard']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Route overview' })).toBeInTheDocument();
        expect(await screen.findByText('RTR-000001')).toBeInTheDocument();
        expect(await screen.findByText('SAL-000002')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View sales history' })).toHaveAttribute(
            'href',
            '/sales/sales-history',
        );
        expect(screen.getByText('8,100')).toBeInTheDocument();
    });

    it('loads the representative own-sales report and filters', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) =>
            url === 'api/sales/report-options'
                ? Promise.resolve({
                      data: {
                          customers: [{ code: 'CUS-ABC', id: 1, name: 'ABC Shop' }],
                          products: [
                              {
                                  id: 1,
                                  name: 'Water 1L',
                                  sku: 'DW-1L',
                                  unit: 'bottle',
                              },
                          ],
                      },
                  })
                : Promise.resolve({
                      data: {
                          data: [
                              {
                                  customer: {
                                      code: 'CUS-ABC',
                                      id: 1,
                                      name: 'ABC Shop',
                                  },
                                  date: '2026-08-17T08:00:00Z',
                                  id: 1,
                                  items: [],
                                  payment_type: 'cash',
                                  reference: 'SAL-000001',
                                  status: 'posted',
                                  total_amount: 5400,
                                  total_quantity: 6,
                              },
                          ],
                          meta: {
                              current_page: 1,
                              from: 1,
                              last_page: 1,
                              per_page: 20,
                              to: 1,
                              total: 1,
                          },
                          rules: { financial_totals: 'posted_only' },
                          summary: {
                              cash_sales: 5400,
                              credit_sales: 0,
                              gross_sales: 5400,
                              units_sold: 6,
                          },
                      },
                  }),
        );
        render(
            <MemoryRouter initialEntries={['/sales/reports']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Sales report' })).toBeInTheDocument();
        expect(await screen.findByText('SAL-000001')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Apply report' })).toBeInTheDocument();
    });

    it('redirects a guest from a protected route to its portal login', () => {
        render(
            <MemoryRouter initialEntries={['/sales/dashboard']}>
                <Root initialUser={null} />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Route sign in' })).toBeInTheDocument();
    });
});
