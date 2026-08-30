import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: vi.fn((success: PositionCallback) =>
                    success({
                        coords: {
                            accuracy: 12,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            latitude: 16.8409,
                            longitude: 96.1735,
                            speed: null,
                            toJSON: () => ({}),
                        },
                        timestamp: Date.now(),
                        toJSON: () => ({}),
                    } as GeolocationPosition),
                ),
            },
        });
    });

    it('renders the admin shell on an admin route', () => {
        render(
            <MemoryRouter initialEntries={['/admin/dashboard']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(screen.getByRole('heading', { name: 'Operations overview' })).toBeInTheDocument();
        expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument();

        const overviewGroup = screen.getByText('Overview').closest('.admin-nav-group');
        expect(overviewGroup).not.toBeNull();
        expect(
            within(overviewGroup as HTMLElement)
                .getAllByRole('link')
                .map((link) => link.textContent),
        ).toEqual(['Dashboard', 'Reports']);
    });

    it('loads the representative performance detail workspace', async () => {
        const meta = { current_page: 1, from: null, last_page: 1, per_page: 10, to: null, total: 0 };
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/representatives/7')
                return Promise.resolve({
                    data: {
                        kpis: {
                            cash_hold: 1400,
                            pending_submission_count: 1,
                            pending_submissions: 400,
                            sales_30_days: 12500,
                            sales_transactions_30_days: 8,
                            stock_products: 2,
                            stock_units: 34,
                        },
                        representative: {
                            account: { email: null, id: 2, is_active: true, last_login_at: null, username: 'koaung' },
                            code: 'SR-001',
                            created_at: null,
                            email: null,
                            id: 7,
                            is_active: true,
                            name: 'Ko Aung',
                            notes: null,
                            phone: '091234567',
                            primary_warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Main Warehouse' },
                            primary_warehouse_id: 1,
                            region: 'Yangon',
                            updated_at: null,
                            vehicle: null,
                        },
                        sales_chart: [{ amount: 12500, date: '2026-08-22', transactions: 8 }],
                        visibility: { cash: true, sales: true, stock: true },
                    },
                });
            if (url === 'api/admin/representative-inventory')
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                foc_quantity: 4,
                                id: 1,
                                pending_quantity: 3,
                                product: {
                                    base_unit: 'bottle',
                                    id: 1,
                                    name: 'Drinking Water',
                                    sku: 'DW-1L',
                                    unit: 'box',
                                },
                                quantity: 12,
                                representative: { code: 'SR-001', id: 7, name: 'Ko Aung' },
                                updated_at: '2026-08-26T10:00:00Z',
                            },
                        ],
                        meta: { ...meta, from: 1, to: 1, total: 1 },
                    },
                });
            return Promise.resolve({ data: { data: [], meta } });
        });

        render(
            <MemoryRouter initialEntries={['/admin/representatives/7']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Ko Aung' })).toBeInTheDocument();
        expect(screen.getByText('12,500 MMK')).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Daily posted sales for the last 30 days' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Holding stock' })).toBeInTheDocument();
        expect(screen.getByRole('searchbox', { name: 'Search holding stock products' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Sale history' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Cash submission history' })).toBeInTheDocument();
        const operationsRow = document.querySelector('.representative-operations-grid');
        expect(operationsRow).not.toBeNull();
        expect(
            within(operationsRow as HTMLElement).getByRole('heading', { name: 'Holding stock' }),
        ).toBeInTheDocument();
        expect(
            within(operationsRow as HTMLElement).getByRole('heading', { name: 'Cash submission history' }),
        ).toBeInTheDocument();
        expect(within(operationsRow as HTMLElement).queryByRole('heading', { name: 'Sale history' })).toBeNull();
        expect(operationsRow?.children[0]).toHaveClass('representative-stock-panel');
        expect(operationsRow?.children[1]).toHaveClass('representative-cash-panel');
        expect(operationsRow?.nextElementSibling).toHaveClass('representative-sales-panel');
        const stockTable = within(operationsRow as HTMLElement).getByRole('table');
        expect(
            within(stockTable)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Product', 'Paid base', 'FOC base', 'Incoming base', 'Updated']);
        expect(within(stockTable).getAllByText('bottle')).toHaveLength(3);
        expect(within(stockTable).getByText('DW-1L · box')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search holding stock products' }), {
            target: { value: 'DW-1L' },
        });
        fireEvent.click(within(operationsRow as HTMLElement).getByRole('button', { name: 'Search' }));
        await waitFor(() =>
            expect(axios.get).toHaveBeenCalledWith(
                'api/admin/representative-inventory',
                expect.objectContaining({
                    params: expect.objectContaining({ page: 1, representative_id: 7, search: 'DW-1L' }),
                }),
            ),
        );
    });

    it('shows representative transfer paid and FOC quantities in the detail table', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url !== 'api/admin/representative-returns/2') return Promise.reject(new Error(`Unexpected GET ${url}`));

            return Promise.resolve({
                data: {
                    data: {
                        cancel_reason: null,
                        cancelled_at: null,
                        cancelled_by: null,
                        created_at: '2026-08-26T10:59:00Z',
                        created_by: { id: 1, name: 'Super Admin' },
                        direction: 'return',
                        dispatched_at: '2026-08-26T11:00:00Z',
                        dispatched_by: { id: 1, name: 'Super Admin' },
                        id: 2,
                        items: [
                            {
                                base_quantity: 24,
                                foc_base_quantity: 6,
                                foc_quantity: 6,
                                foc_unit: { conversion_factor: 1, id: 21, name: 'bottle' },
                                id: 1,
                                in_transit_quantity: 0,
                                product: {
                                    id: 1,
                                    name: 'Drinking Water 1 Litre',
                                    sku: 'DW-1L',
                                    unit: 'bottle',
                                },
                                quantity: 2,
                                unit: { conversion_factor: 12, id: 22, name: 'box' },
                            },
                        ],
                        notes: null,
                        received_at: '2026-08-26T11:01:00Z',
                        received_by: { id: 1, name: 'Super Admin' },
                        reference: 'RRT-000002',
                        representative: { code: 'SR-000001', id: 7, name: 'Kaung Htet Tin' },
                        reversal_reason: null,
                        reversed_at: null,
                        reversed_by: null,
                        source_warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Warehouse' },
                        status: 'received',
                        total_quantity: 2,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/admin/transfers/representative-return/2']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'RRT-000002' })).toBeInTheDocument();
        const table = screen.getByRole('table', { name: 'Transfer product lines' });
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Product', 'Unit', 'Transfer quantity', 'FOC', 'Paid base', 'In transit']);
        expect(within(table).getByText('bottle, 6 base')).toBeInTheDocument();
        expect(within(table).getByText('FOC base').parentElement).toHaveTextContent('6FOC base');
        expect(within(screen.getByRole('region', { name: 'Transfer summary' })).getByText('30')).toBeInTheDocument();
    });

    it('reviews the complete representative paid and FOC holding without editable quantities', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/representative-return-options')
                return Promise.resolve({
                    data: {
                        products: [
                            {
                                id: 1,
                                name: 'Drinking Water',
                                representative_foc_stock: { 7: 5 },
                                representative_stock: { 7: 24 },
                                sku: 'DW-1L',
                                unit: 'box',
                                units: [
                                    {
                                        conversion_factor: 1,
                                        id: 11,
                                        is_base: true,
                                        is_default_selling: false,
                                        name: 'bottle',
                                    },
                                    {
                                        conversion_factor: 12,
                                        id: 12,
                                        is_base: false,
                                        is_default_selling: true,
                                        name: 'box',
                                    },
                                ],
                            },
                        ],
                        representatives: [{ code: 'SR-001', id: 7, name: 'Ko Aung', primary_warehouse_id: 1 }],
                        source_warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main' }],
                    },
                });
            return Promise.resolve({ data: {} });
        });

        render(
            <MemoryRouter
                initialEntries={[
                    '/admin/transfers/representative-return/new?tripId=9&warehouseId=1&representativeId=7',
                ]}
            >
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Return all stock' })).toBeInTheDocument();
        expect(await screen.findByText('Complete return only')).toBeInTheDocument();
        expect(screen.getByText('SR-001 · Ko Aung')).toBeInTheDocument();
        expect(screen.getByText('YGN-MAIN · Yangon Main')).toBeInTheDocument();
        expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
            'Product',
            'Paid return',
            'FOC return',
            'Total',
        ]);
        expect(screen.getByText('DW-1L · bottle')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirm full return' })).toBeEnabled();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.getByRole('table')).toHaveTextContent('24');
        expect(screen.getByRole('table')).toHaveTextContent('5');
        expect(screen.getByRole('table')).toHaveTextContent('29');
    });

    it('keeps representative issue units and quantities in one compact item row', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url !== 'api/admin/representative-transfer-options')
                return Promise.reject(new Error(`Unexpected GET ${url}`));

            return Promise.resolve({
                data: {
                    products: [
                        {
                            id: 1,
                            name: 'Drinking Water',
                            sku: 'DW-1L',
                            unit: 'box',
                            units: [
                                {
                                    conversion_factor: 1,
                                    id: 11,
                                    is_base: true,
                                    is_default_selling: false,
                                    name: 'bottle',
                                },
                                {
                                    conversion_factor: 10,
                                    id: 12,
                                    is_base: false,
                                    is_default_selling: true,
                                    name: 'box',
                                },
                            ],
                            warehouse_stock: { 1: 909 },
                        },
                    ],
                    representatives: [{ code: 'SR-001', id: 7, name: 'Ko Aung', primary_warehouse_id: 1 }],
                    source_warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main' }],
                },
            });
        });

        render(
            <MemoryRouter
                initialEntries={[
                    '/admin/transfers/representative/new?tripId=9&warehouseId=1&representativeId=7',
                ]}
            >
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Create representative issue' })).toBeInTheDocument();
        expect(await screen.findByText('YGN-MAIN · Yangon Main')).toBeInTheDocument();
        expect(screen.getByText('SR-001 · Ko Aung')).toBeInTheDocument();
        expect(screen.queryByText('Issue information')).not.toBeInTheDocument();
        expect(screen.getByText('Product selection')).toBeInTheDocument();
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Drinking Water' }));
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        expect(screen.getByText('Set issue quantities')).toBeInTheDocument();
        const issueUnit = screen.getByRole('combobox', { name: 'Issue unit' });
        const issueQuantityLine = issueUnit.closest('.transfer-quantity-line');
        expect(issueQuantityLine).not.toBeNull();
        expect(within(issueQuantityLine as HTMLElement).getAllByRole('combobox')).toHaveLength(2);
        expect(within(issueQuantityLine as HTMLElement).getAllByRole('spinbutton')).toHaveLength(2);
        expect(issueQuantityLine?.querySelectorAll(':scope > label')).toHaveLength(4);
        expect(screen.getByRole('spinbutton', { name: 'Paid stock quantity' })).toHaveValue(1);
        expect(screen.getByRole('spinbutton', { name: 'FOC quantity' })).toHaveValue(0);
    });

    it('filters customer detail sales and summary by an applied date range', async () => {
        const meta = { current_page: 1, from: 1, last_page: 1, per_page: 20, to: 1, total: 1 };
        const get = vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/customers/9') {
                return Promise.resolve({
                    data: {
                        data: {
                            address: 'Hlaing',
                            code: 'CUS-009',
                            created_at: '2026-08-01T00:00:00Z',
                            credit_allowed: false,
                            credit_limit: 0,
                            customer_type: 'Shop',
                            id: 9,
                            is_active: true,
                            name: 'ABC Shop',
                            notes: null,
                            phone: '091234567',
                            region: { id: 1, name: 'Yangon West', warehouse_id: 1 },
                            region_id: 1,
                            township: 'Hlaing',
                            updated_at: '2026-08-01T00:00:00Z',
                            warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Main Warehouse' },
                            warehouse_id: 1,
                        },
                    },
                });
            }
            if (url === 'api/admin/sales') {
                return Promise.resolve({
                    data: { data: [], meta, summary: { cash_total: 0, credit_total: 0, posted_total: 0, total: 0 } },
                });
            }
            return Promise.resolve({ data: {} });
        });

        render(
            <MemoryRouter initialEntries={['/admin/customers/9']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'ABC Shop' })).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Customer sales from date'), { target: { value: '2026-08-01' } });
        fireEvent.change(screen.getByLabelText('Customer sales to date'), { target: { value: '2026-08-20' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/admin/sales', {
                params: {
                    customer_id: 9,
                    date_from: '2026-08-01',
                    date_to: '2026-08-20',
                    page: 1,
                    per_page: 20,
                },
            }),
        );
        expect(screen.getByText('Within selected date range')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('loads user administration without the role workspace', async () => {
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

        expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
        expect(await screen.findByText(/admin@stockflow\.local/)).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /Roles/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Roles & permissions' })).not.toBeInTheDocument();
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
        expect(screen.getByRole('table')).toHaveClass('warehouse-table');
        expect(screen.getByRole('table').parentElement).toHaveClass('warehouse-table-wrap');
        expect(screen.getByRole('link', { name: 'Open settings for Yangon Main Warehouse' })).toHaveAttribute(
            'href',
            '/admin/warehouses/1/settings',
        );
        fireEvent.click(screen.getByRole('button', { name: 'New warehouse' }));
        const warehouseDialog = screen.getByRole('dialog', { name: 'Create warehouse' });
        expect(warehouseDialog).toBeInTheDocument();
        expect(within(warehouseDialog).getByRole('textbox', { name: 'Address' })).toBeInTheDocument();
        expect(within(warehouseDialog).queryByRole('textbox', { name: 'Region' })).not.toBeInTheDocument();
        expect(within(warehouseDialog).queryByRole('textbox', { name: 'Township' })).not.toBeInTheDocument();
    });

    it('loads Region management on a separate warehouse settings page', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                data: {
                    address: 'No. 12, Main Road',
                    code: 'YGN-MAIN',
                    created_at: '2026-08-17T00:00:00Z',
                    id: 1,
                    is_active: true,
                    name: 'Yangon Main Warehouse',
                    notes: null,
                    phone: '09-123456789',
                    updated_at: '2026-08-17T00:00:00Z',
                    users_count: 2,
                    regions: [
                        {
                            id: 10,
                            warehouse_id: 1,
                            name: 'Yangon East',
                            notes: null,
                            is_active: true,
                        },
                        {
                            id: 11,
                            warehouse_id: 1,
                            name: 'Yangon North',
                            notes: null,
                            is_active: true,
                        },
                    ],
                },
            },
        });

        render(
            <MemoryRouter initialEntries={['/admin/warehouses/1/settings']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Yangon Main Warehouse' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Region management' })).toBeInTheDocument();
        expect(screen.getByDisplayValue('Yangon East')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Deactivate Region Yangon East' })).toBeInTheDocument();
        fireEvent.change(screen.getByDisplayValue('Yangon East'), { target: { value: 'Yangon East Updated' } });
        expect(screen.getByRole('button', { name: 'Save Region name' })).toBeInTheDocument();
        fireEvent.change(screen.getByDisplayValue('Yangon East Updated'), { target: { value: 'Yangon East' } });
        expect(screen.queryByLabelText('New Region')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Add Region' }));
        const regionDialog = screen.getByRole('dialog', { name: 'Create Region' });
        expect(regionDialog).toBeInTheDocument();
        const regionNameInput = within(regionDialog).getByRole('textbox', { name: 'Region name' });
        regionNameInput.focus();
        fireEvent.change(regionNameInput, { target: { value: 'M' } });
        expect(regionNameInput).toHaveFocus();
        fireEvent.change(regionNameInput, { target: { value: 'Mingalar Taung Nyunt' } });
        expect(regionNameInput).toHaveValue('Mingalar Taung Nyunt');
        expect(regionNameInput).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(screen.getByDisplayValue('Yangon North')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('loads product management and opens the dedicated creation page', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/product-options')
                return Promise.resolve({
                    data: {
                        categories: ['Drinking Water'],
                        units: ['bottle'],
                        regions: [
                            {
                                id: 4,
                                name: 'Yangon',
                                warehouse: { code: 'YGN-MAIN', id: 2, name: 'Yangon Main' },
                            },
                            {
                                id: 2,
                                name: 'Mandalay',
                                warehouse: { code: 'MDY-MAIN', id: 1, name: 'Mandalay Main' },
                            },
                            {
                                id: 3,
                                name: 'Mingaladon',
                                warehouse: { code: 'YGN-MAIN', id: 2, name: 'Yangon Main' },
                            },
                            {
                                id: 1,
                                name: 'Pyin Oo Lwin',
                                warehouse: { code: 'MDY-MAIN', id: 1, name: 'Mandalay Main' },
                            },
                        ],
                    },
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
        expect(await screen.findByRole('heading', { name: 'Create product' })).toBeInTheDocument();
        expect(await screen.findByRole('heading', { name: 'Catalogue and pricing setup' })).toBeInTheDocument();
        const unitTable = screen.getByRole('table', { name: 'Product units and prices by warehouse Region' });
        expect(
            Array.from(unitTable.querySelectorAll<HTMLTableCellElement>('th[data-region-id]')).map(
                (header) => header.firstChild?.textContent,
            ),
        ).toEqual(['Mandalay', 'Pyin Oo Lwin', 'Mingaladon', 'Yangon']);
        expect(await within(unitTable).findByRole('textbox', { name: 'Unit name for row 1' })).toHaveValue('piece');
        const regionalPrice = within(unitTable).getByRole('textbox', {
            name: 'Mandalay price for piece in MMK',
        });
        expect(regionalPrice).toHaveAttribute('inputmode', 'numeric');
        expect(regionalPrice).toHaveValue('0');
        fireEvent.change(regionalPrice, { target: { value: '12,500' } });
        expect(regionalPrice).toHaveValue('12,500');
        expect(within(unitTable).getAllByText('MMK')).toHaveLength(4);
        expect(unitTable.querySelector('.product-price-input__currency')).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
                                selling_price: 1000,
                                sku: 'DW-1L',
                                unit: 'bottle',
                                units: [
                                    {
                                        conversion_factor: 1,
                                        id: 11,
                                        is_base: true,
                                        is_default_selling: false,
                                        name: 'bottle',
                                    },
                                    {
                                        conversion_factor: 12,
                                        id: 12,
                                        is_base: false,
                                        is_default_selling: true,
                                        name: 'box',
                                    },
                                ],
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
                                base_unit: 'bottle',
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
        expect(screen.queryByRole('combobox', { name: 'Product' })).not.toBeInTheDocument();
        expect(screen.queryByRole('columnheader', { name: 'Warehouse' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
        fireEvent.click(screen.getByRole('button', { name: 'New import' }));
        expect(await screen.findByRole('heading', { name: 'Create stock import' })).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(await screen.findByText('Basic information')).toBeInTheDocument();
        const importForm = within(screen.getByRole('main'));
        fireEvent.click(importForm.getByRole('button', { name: 'Next' }));
        expect(importForm.getByText('Select products')).toBeInTheDocument();
        expect(importForm.getByRole('searchbox', { name: 'Search import products' })).toBeInTheDocument();
        fireEvent.click(importForm.getByRole('checkbox', { name: 'Select Drinking Water 1 Litre' }));
        expect(importForm.getByText('1 selected')).toBeInTheDocument();
        fireEvent.click(importForm.getByRole('button', { name: 'Next' }));
        expect(importForm.getByText('Units and quantities')).toBeInTheDocument();
        expect(importForm.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
        const unitSelect = importForm.getByRole('combobox', { name: 'Unit' });
        expect(unitSelect).toHaveValue('12');
        fireEvent.change(unitSelect, { target: { value: '11' } });
        fireEvent.change(importForm.getByRole('spinbutton', { name: 'Import quantity' }), {
            target: { value: '12' },
        });
        fireEvent.click(importForm.getByRole('button', { name: 'Review' }));
        expect(importForm.getByText('12 total base units')).toBeInTheDocument();
        expect(importForm.queryByRole('columnheader', { name: 'Selling price' })).not.toBeInTheDocument();
        expect(importForm.getByRole('button', { name: 'Post import' })).toBeInTheDocument();
        expect(importForm.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
        fireEvent.click(importForm.getByRole('button', { name: 'Cancel' }));
        expect(await screen.findByRole('heading', { name: 'Warehouse inventory' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'New adjustment' }));
        expect(screen.getByRole('dialog', { name: 'Create stock adjustment' })).toBeInTheDocument();
    });

    it('loads transfer management and opens a warehouse transfer draft', async () => {
        const post = vi.spyOn(axios, 'post');
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
                                units: [
                                    {
                                        conversion_factor: 1,
                                        id: 21,
                                        is_base: true,
                                        is_default_selling: false,
                                        name: 'bottle',
                                    },
                                    {
                                        conversion_factor: 12,
                                        id: 22,
                                        is_base: false,
                                        is_default_selling: true,
                                        name: 'box',
                                    },
                                ],
                            },
                        ],
                        source_warehouses: [
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
        expect(await screen.findByRole('heading', { name: 'Create warehouse transfer' })).toBeInTheDocument();
        const transferForm = within(screen.getByRole('main'));
        expect(await screen.findByRole('list', { name: 'Warehouse transfer progress' })).toBeInTheDocument();
        expect(transferForm.queryByRole('dialog')).not.toBeInTheDocument();
        const sourceWarehouse = transferForm.getByRole('combobox', { name: 'Source warehouse' });
        const destinationWarehouse = transferForm.getByRole('combobox', { name: 'Destination warehouse' });
        await waitFor(() => {
            expect(sourceWarehouse).toHaveValue('1');
            expect(destinationWarehouse).toHaveValue('2');
        });
        fireEvent.change(sourceWarehouse, { target: { value: '2' } });
        expect(sourceWarehouse).toHaveValue('2');
        expect(destinationWarehouse).toHaveValue('1');
        expect(within(destinationWarehouse).queryByRole('option', { name: /Mandalay/ })).not.toBeInTheDocument();
        fireEvent.click(transferForm.getByRole('button', { name: 'Continue' }));
        fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Drinking Water 1 Litre' }));
        fireEvent.click(transferForm.getByRole('button', { name: 'Continue' }));
        expect(transferForm.getByRole('combobox', { name: 'Unit' })).toHaveValue('22');
        fireEvent.change(transferForm.getByRole('spinbutton', { name: 'Transfer quantity' }), {
            target: { value: '3' },
        });
        fireEvent.click(transferForm.getByRole('button', { name: 'Continue' }));
        expect(transferForm.getByText('Total base units').parentElement).toHaveTextContent('36');
        expect(transferForm.getByRole('columnheader', { name: 'Unit' })).toBeInTheDocument();
        expect(transferForm.getByRole('button', { name: 'Submit transfer' })).toBeInTheDocument();
        expect(post).not.toHaveBeenCalled();
    });

    it('loads representative stock and pending receiving in the sales app', async () => {
        const get = vi.spyOn(axios, 'get').mockImplementation((url) => {
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
                            last_page: 2,
                            per_page: 10,
                            to: 10,
                            total: 11,
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
                            foc_quantity: 5,
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
                        last_page: 2,
                        per_page: 10,
                        to: 10,
                        total: 11,
                    },
                    summary: { incoming: 20, on_hand: 70 },
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
        expect(screen.getByRole('link', { name: 'View receiving details for RTR-000002' })).toHaveAttribute(
            'href',
            '/sales/receivings/1',
        );
        const stockTable = screen.getByRole('table', { name: 'Available product stock' });
        expect(within(stockTable).getByRole('columnheader', { name: 'Paid base' })).toBeInTheDocument();
        expect(within(stockTable).getByRole('columnheader', { name: 'FOC base' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search available products' }), {
            target: { value: 'DW-1L' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Search' }));
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/sales/stock', {
                params: { page: 1, per_page: 10, search: 'DW-1L' },
            }),
        );
        fireEvent.click(within(screen.getByRole('navigation', { name: 'Pending stock pagination' })).getByText('Next'));
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/sales/receivings', { params: { page: 2, per_page: 10 } }),
        );
        fireEvent.click(
            within(screen.getByRole('navigation', { name: 'Available products pagination' })).getByText('Next'),
        );
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/sales/stock', {
                params: { page: 2, per_page: 10, search: 'DW-1L' },
            }),
        );
    });

    it('shows paid and FOC units in the representative receiving detail table', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url !== 'api/sales/receivings/1') return Promise.reject(new Error(`Unexpected GET ${url}`));

            return Promise.resolve({
                data: {
                    data: {
                        cancel_reason: null,
                        cancelled_at: null,
                        cancelled_by: null,
                        created_at: '2026-08-26T10:40:00Z',
                        created_by: { id: 1, name: 'Super Admin' },
                        direction: 'issue',
                        dispatched_at: '2026-08-26T10:46:00Z',
                        dispatched_by: { id: 1, name: 'Super Admin' },
                        id: 1,
                        items: [
                            {
                                base_quantity: 24,
                                foc_base_quantity: 6,
                                foc_quantity: 6,
                                foc_unit: { conversion_factor: 1, id: 21, name: 'bottle' },
                                id: 1,
                                in_transit_quantity: 0,
                                product: {
                                    id: 1,
                                    name: 'Drinking Water 1 Litre',
                                    sku: 'DW-1L',
                                    unit: 'bottle',
                                },
                                quantity: 2,
                                unit: { conversion_factor: 12, id: 22, name: 'box' },
                            },
                        ],
                        notes: null,
                        received_at: '2026-08-26T10:50:00Z',
                        received_by: { id: 2, name: 'Ko Aung' },
                        reference: 'RTR-000001',
                        representative: { code: 'SR-001', id: 1, name: 'Ko Aung' },
                        reversal_reason: null,
                        reversed_at: null,
                        reversed_by: null,
                        source_warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Warehouse' },
                        status: 'received',
                        total_quantity: 2,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/sales/receivings/1']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'RTR-000001' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '1 products · 30 base units' })).toBeInTheDocument();
        const table = screen.getByRole('table', { name: 'Receiving product lines' });
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Product', 'Paid', 'FOC', 'Total base']);
        expect(within(table).getByText('box, 24 base')).toBeInTheDocument();
        expect(within(table).getByText('bottle, 6 base')).toBeInTheDocument();
        expect(within(table).getAllByRole('row')).toHaveLength(3);
    });

    it('loads the representative sale-entry workflow with stock and credit previews', async () => {
        const post = vi.spyOn(axios, 'post');
        post.mockImplementation((url) => {
            if (url === 'api/sales/customers')
                return Promise.resolve({
                    data: {
                        customer: {
                            available_credit: 0,
                            code: 'CUS-000001',
                            credit_allowed: false,
                            credit_limit: 0,
                            id: 3,
                            name: 'New Route Shop',
                            outstanding_amount: 0,
                        },
                    },
                });
            if (url === 'api/sales/sales')
                return Promise.resolve({
                    data: {
                        data: { id: 9, reference: 'SAL-000009', total_amount: 2000 },
                    },
                });
            return Promise.resolve({ data: {} });
        });
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
                                foc_quantity: 5,
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

        fireEvent.click(screen.getByRole('button', { name: 'New customer' }));
        const customerDialog = within(screen.getByRole('dialog', { name: 'New customer' }));
        expect(customerDialog.getByText(/Credit is disabled and the credit limit starts at 0/)).toBeInTheDocument();
        fireEvent.change(customerDialog.getByLabelText('Customer name'), { target: { value: 'New Route Shop' } });
        fireEvent.click(customerDialog.getByRole('button', { name: 'Create customer' }));
        await waitFor(() => expect(post).toHaveBeenCalledWith('api/sales/customers', expect.any(Object)));
        expect(await screen.findByText('New Route Shop created as a cash-only customer.')).toBeInTheDocument();
        expect(customerSearch).toHaveValue('CUS-000001 · New Route Shop');
        expect(screen.getByRole('radio', { name: 'Paid now' })).toBeChecked();
        expect(screen.getByRole('radio', { name: 'Credit' })).toBeDisabled();

        fireEvent.change(customerSearch, { target: { value: 'ABC' } });
        fireEvent.click(screen.getByRole('option', { name: /ABC Shop/ }));
        expect(customerSearch).toHaveValue('CUS-ABC · ABC Shop');
        expect(screen.getByRole('region', { name: 'Customer credit status' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Credit available: Yes' })).toBeInTheDocument();
        expect(screen.getByText('7,500 MMK')).toBeInTheDocument();

        fireEvent.change(customerSearch, { target: { value: 'Cash Corner' } });
        fireEvent.click(screen.getByRole('option', { name: /Cash Corner/ }));
        expect(screen.getByRole('img', { name: 'Credit available: No' })).toBeInTheDocument();
        expect(screen.getByText('Credit not allowed')).toBeInTheDocument();
        expect(screen.getByText('This customer is configured for cash payments only.')).toBeInTheDocument();
        expect(screen.queryByText('Credit limit')).not.toBeInTheDocument();

        fireEvent.change(customerSearch, { target: { value: 'ABC Shop' } });
        fireEvent.click(screen.getByRole('option', { name: /ABC Shop/ }));
        fireEvent.click(screen.getByRole('radio', { name: 'Credit' }));
        expect(screen.getByRole('radio', { name: 'Credit' })).toBeChecked();
        expect(screen.getByText('Device location captured')).toBeInTheDocument();
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
        const focQuantity = screen.getByLabelText('FOC quantity');
        fireEvent.change(focQuantity, { target: { value: '6' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review sale' }));
        expect(await screen.findByText('Only 5 FOC base units are available.')).toBeInTheDocument();

        fireEvent.change(focQuantity, { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Review sale' }));
        expect(screen.getByRole('heading', { name: 'Review & submit' })).toBeInTheDocument();
        expect(screen.queryByText('Server preview')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Sale summary' })).not.toBeInTheDocument();
        expect(screen.queryByText(/7,500 MMK available/)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit information' })).toBeInTheDocument();
        expect(screen.getByText('FOC: 2 bottle · 2 base')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Stock movement summary' })).toHaveTextContent(
            'Paid base units2FOC base units2',
        );
        expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Post sale' })).toBeInTheDocument();
        expect(post).toHaveBeenCalledTimes(1);
        expect(post).not.toHaveBeenCalledWith('api/sales/sales', expect.anything(), expect.anything());
        fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
        await waitFor(() =>
            expect(post).toHaveBeenCalledWith(
                'api/sales/sales',
                expect.objectContaining({
                    creation_latitude: 16.8409,
                    creation_longitude: 96.1735,
                    location_accuracy_meters: 12,
                    items: [
                        expect.objectContaining({
                            foc_quantity: 2,
                            quantity: 2,
                        }),
                    ],
                }),
                expect.any(Object),
            ),
        );
    });

    it('links the profile menu to the sales customer list and new customer page', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/customers')
                return Promise.resolve({
                    data: {
                        data: [
                            {
                                address: null,
                                code: 'CUS-000001',
                                created_at: '2026-08-26T00:00:00Z',
                                credit_allowed: false,
                                credit_limit: 0,
                                customer_type: 'Shop',
                                id: 1,
                                is_active: true,
                                name: 'Route Shop',
                                notes: null,
                                phone: '09-111222333',
                                region_id: 1,
                                township: 'Hlaing',
                                region: {
                                    id: 1,
                                    name: 'Yangon North',
                                    warehouse: { code: 'YGN', id: 1, name: 'Yangon Warehouse' },
                                    warehouse_id: 1,
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
            return Promise.resolve({ data: {} });
        });

        render(
            <MemoryRouter initialEntries={['/sales/customers']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Customers' })).toBeInTheDocument();
        expect(await screen.findByText('Route Shop')).toBeInTheDocument();
        expect(screen.getByText('Yangon Warehouse · Yangon North')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
        expect(screen.getByRole('menuitem', { name: 'Customers' })).toHaveAttribute('href', '/sales/customers');
        fireEvent.click(screen.getByRole('link', { name: 'New customer' }));
        expect(await screen.findByRole('heading', { name: 'New customer' })).toBeInTheDocument();
        expect(screen.getByText(/Credit is disabled and the credit limit starts at 0/)).toBeInTheDocument();
    });

    it('shows draft sale actions in a right-aligned history menu', async () => {
        const get = vi.spyOn(axios, 'get').mockImplementation((url) => {
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
            const sale = {
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
            };
            if (url === 'api/sales/sales/3') return Promise.resolve({ data: { data: sale } });
            return Promise.resolve({
                data: {
                    data: [sale],
                    meta: {
                        current_page: 1,
                        from: 1,
                        last_page: 2,
                        per_page: 10,
                        to: 10,
                        total: 11,
                    },
                },
            });
        });

        render(
            <MemoryRouter initialEntries={['/sales/sales-history']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('heading', { name: 'Sales' })).toBeInTheDocument();
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

        fireEvent.click(within(screen.getByRole('navigation', { name: 'Sales pagination' })).getByText('Next'));
        await waitFor(() => expect(get).toHaveBeenCalledWith('api/sales/sales', { params: { page: 2, per_page: 10 } }));

        const refreshedTrigger = await screen.findByRole('button', { name: 'Actions for SAL-000003' });
        fireEvent.click(refreshedTrigger);
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
                                    foc_quantity: 1,
                                    foc_unit: { conversion_factor: 1, id: 1, name: 'bottle' },
                                    quantity: 2,
                                    unit: { conversion_factor: 1, id: 1, name: 'bottle' },
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
        expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sales' })).toHaveAttribute(
            'href',
            '/sales/sales-history',
        );
        expect(screen.getByRole('heading', { name: 'Sale information' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Line items' })).toBeInTheDocument();
        const lineItems = screen.getByRole('table', { name: 'Sale line items' });
        expect(
            within(lineItems)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Product', 'Unit', 'Paid qty', 'FOC', 'Unit price', 'Line total']);
        expect(within(lineItems).getAllByRole('row')).toHaveLength(2);
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
        const get = vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/customer-options')
                return Promise.resolve({
                    data: {
                        regions: [{ id: 11, name: 'Yangon West', warehouse_id: 1 }],
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
                            region_id: 11,
                            region: { id: 11, name: 'Yangon West', warehouse_id: 1 },
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
        fireEvent.change(screen.getByLabelText('Search customers'), { target: { value: 'ABC' } });
        fireEvent.change(screen.getByLabelText('Filter by warehouse'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Filter by region'), { target: { value: '11' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/admin/customers', {
                params: {
                    page: 1,
                    per_page: 20,
                    region_id: '11',
                    search: 'ABC',
                    warehouse_id: '1',
                },
            }),
        );
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
        const [desktopNavigation, mobileNavigation] = screen.getAllByRole('navigation', {
            name: 'Representative navigation',
        });
        expect(desktopNavigation).toHaveClass('sales-desktop-nav');
        expect(within(desktopNavigation).getByRole('link', { name: 'Sales' })).toHaveAttribute(
            'href',
            '/sales/sales-history',
        );
        expect(within(mobileNavigation).getByRole('link', { name: 'Sales' })).toHaveAttribute('href', '/sales/sales-history');
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

    it('shows an incorrect-credentials error on the office admin login form', async () => {
        vi.spyOn(axios, 'get').mockResolvedValue({ data: {} });
        vi.spyOn(axios, 'post').mockRejectedValue({
            isAxiosError: true,
            response: {
                data: {
                    errors: { login: ['The provided credentials are incorrect.'] },
                    message: 'The provided credentials are incorrect.',
                },
                status: 422,
            },
        });

        render(
            <MemoryRouter initialEntries={['/admin/login']}>
                <Root initialUser={null} />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'office.admin' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('The provided credentials are incorrect.');
    });

    it('loads the representative cash workspace and opens submission entry', async () => {
        const get = vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/sales/current-trip')
                return Promise.resolve({
                    data: {
                        data: {
                            id: 7,
                            reference: 'TRP-000007',
                            title: 'Downtown route',
                            status: 'operation',
                            opening_cash_balance: 0,
                            warehouse: { id: 1, code: 'YGN-MAIN', name: 'Yangon Main' },
                            financial_summary: {
                                cash_sales: 1400,
                                cash_submitted_confirmed: 0,
                                cash_submitted_pending: 1000,
                            },
                        },
                    },
                });
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
                    },
                });
            if (url === 'api/sales/cash-transactions')
                return Promise.resolve({
                    data: {
                        data: [
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
                        meta: {
                            current_page: 1,
                            from: 1,
                            last_page: 2,
                            per_page: 10,
                            to: 10,
                            total: 11,
                        },
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
                        last_page: 2,
                        per_page: 10,
                        to: 10,
                        total: 11,
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
        fireEvent.click(
            within(screen.getByRole('navigation', { name: 'Cash submissions pagination' })).getByText('Next'),
        );
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/sales/cash-submissions', { params: { page: 2, per_page: 10, trip_id: 7 } }),
        );
        fireEvent.click(screen.getByRole('tab', { name: /Cash ledger/ }));
        fireEvent.click(within(screen.getByRole('navigation', { name: 'Cash activity pagination' })).getByText('Next'));
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/sales/cash-transactions', { params: { page: 2, per_page: 10 } }),
        );
        fireEvent.click(screen.getByRole('button', { name: 'Return cash' }));
        expect(screen.getByRole('dialog', { name: 'Return trip cash' })).toBeInTheDocument();
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
                        data: [
                            {
                                amount: 1000,
                                cancel_reason: null,
                                cancelled_at: null,
                                cancelled_by: null,
                                confirmed_at: null,
                                confirmed_by: null,
                                created_at: '2026-08-22T07:01:00Z',
                                created_by: { id: 2, name: 'Ko Aung' },
                                id: 1,
                                notes: 'Morning handover',
                                reference: 'CSB-000003',
                                representative: { code: 'SR-001', id: 1, name: 'Ko Aung' },
                                reversal_reason: null,
                                reversed_at: null,
                                reversed_by: null,
                                status: 'pending',
                                warehouse: { code: 'YGN-MAIN', id: 1, name: 'Yangon Main' },
                            },
                        ],
                        meta,
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
        expect(screen.getByRole('heading', { name: 'Representative cash holds' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Cash submissions' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Cash submissions/ }));
        expect(screen.queryByRole('heading', { name: 'Representative cash holds' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Cash submissions' })).toBeInTheDocument();
        expect(screen.getByText('CSB-000003')).toBeInTheDocument();
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
        const movementsTable = screen.getByRole('table', { name: 'Recent stock movements' });
        expect(movementsTable).toHaveClass('dashboard-stock-movements-table');
        expect(
            within(movementsTable)
                .getAllByRole('columnheader')
                .map((header) => header.textContent),
        ).toEqual(['Reference', 'Product', 'Movement', 'Qty', 'Actor / time']);
        expect(screen.getByRole('combobox', { name: 'Warehouse scope' })).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: 'Transfers, 2 actions need attention' })).toBeInTheDocument();
        expect(
            await screen.findByRole('link', { name: 'Cash & credit, 1 action needs attention' }),
        ).toBeInTheDocument();
    });

    it('loads the sales analysis workspace with posted-only totals', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) => {
            if (url === 'api/admin/report-options')
                return Promise.resolve({
                    data: {
                        reports: ['sales', 'representatives', 'customers'],
                        warehouses: [{ code: 'YGN-MAIN', id: 1, name: 'Yangon Main' }],
                    },
                });
            if (url === 'api/admin/reports/sales')
                return Promise.resolve({
                    data: {
                        analysis: {
                            month_trend: [{ amount: 800, date: '2026-08-17', label: '17' }],
                            top_products: [
                                {
                                    amount: 800,
                                    product: { id: 1, name: 'Water 1L', sku: 'DW-1L', unit: 'bottle' },
                                    units: 8,
                                },
                            ],
                            year_trend: [{ amount: 800, label: 'Aug', month: 8 }],
                        },
                        data: [{ id: 99, reference: 'SHOULD-NOT-RENDER' }],
                        meta: { current_page: 1, from: 1, last_page: 1, per_page: 25, to: 1, total: 1 },
                        report: 'sales',
                        rules: { financial_totals: 'posted_only' },
                        summary: {
                            cash_sales: 500,
                            credit_sales: 300,
                            gross_sales: 800,
                            month_sales: 800,
                            units_sold: 8,
                            year_sales: 800,
                        },
                    },
                });
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });
        render(
            <MemoryRouter initialEntries={['/admin/reports']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { level: 1, name: 'Sales analysis' })).toBeInTheDocument();
        expect(await screen.findByRole('img', { name: 'Current month sales by day' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Current year sales by month' })).toBeInTheDocument();
        expect(screen.getByRole('img', { name: 'Top-selling products by units sold' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Top-selling products' })).toBeInTheDocument();
        expect(screen.getAllByText('800 MMK', { selector: '.metric-card strong' })).toHaveLength(3);
        expect(screen.queryByRole('combobox', { name: 'Representative' })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Customer' })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Product' })).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Payment type' })).not.toBeInTheDocument();
        expect(screen.queryByText('SHOULD-NOT-RENDER')).not.toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Warehouse stock' })).not.toBeInTheDocument();
        expect(screen.getByRole('tablist', { name: 'Report sections' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Representative analysis' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Customer analysis' })).toBeInTheDocument();
        expect(screen.queryByRole('combobox', { name: 'Report' })).not.toBeInTheDocument();
        const applyButton = screen.getByRole('button', { name: 'Apply' });
        expect(applyButton.closest('.report-filter-action')).not.toBeNull();
        expect(applyButton.closest('.report-filter-scroll')).toBeNull();
        expect(screen.getByRole('combobox', { name: 'Warehouse' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
        expect(screen.getByLabelText('Date from')).toBeInTheDocument();
        expect(screen.getByLabelText('Date to')).toBeInTheDocument();
        expect(screen.getByRole('searchbox', { name: 'Search report' })).toBeInTheDocument();
    });

    it('filters the main admin sale register by duration', async () => {
        const get = vi.spyOn(axios, 'get').mockResolvedValue({
            data: {
                data: [],
                meta: { current_page: 1, from: null, last_page: 1, per_page: 20, to: null, total: 0 },
            },
        });
        render(
            <MemoryRouter initialEntries={['/admin/sales']}>
                <Root initialUser={baseUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Sales' })).toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox', { name: 'Sale duration' }), { target: { value: '7_days' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/admin/sales', {
                params: {
                    date_from: undefined,
                    date_to: undefined,
                    page: 1,
                    payment_type: '',
                    period: '7_days',
                    search: '',
                    status: '',
                    per_page: 20,
                },
            }),
        );
        expect(document.querySelector('.sales-filter-scroll')).toBeInTheDocument();

        fireEvent.change(screen.getByRole('combobox', { name: 'Sale duration' }), {
            target: { value: 'custom' },
        });
        fireEvent.change(screen.getByLabelText('Sale date from'), { target: { value: '2026-08-01' } });
        fireEvent.change(screen.getByLabelText('Sale date to'), { target: { value: '2026-08-22' } });
        fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
        await waitFor(() =>
            expect(get).toHaveBeenCalledWith('api/admin/sales', {
                params: {
                    date_from: '2026-08-01',
                    date_to: '2026-08-22',
                    page: 1,
                    payment_type: '',
                    period: undefined,
                    search: '',
                    status: '',
                    per_page: 20,
                },
            }),
        );
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

    it('loads the unified representative sales history and reporting filters', async () => {
        vi.spyOn(axios, 'get').mockImplementation((url) =>
            url === 'api/sales/sale-history-options'
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
                          trips: [{ id: 7, reference: 'TRP-000007', title: 'North route' }],
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
                                  created_at: '2026-08-17T08:00:00Z',
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
                              per_page: 10,
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
            <MemoryRouter initialEntries={['/sales/sales-history']}>
                <Root initialUser={representativeUser} />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('heading', { name: 'Sales' })).toBeInTheDocument();
        expect(await screen.findByText('SAL-000001')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'More filters' })).toBeInTheDocument();
        expect(screen.getAllByText('5,400 MMK').length).toBeGreaterThan(0);
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
