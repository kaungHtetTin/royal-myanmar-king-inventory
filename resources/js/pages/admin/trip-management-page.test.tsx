import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TripManagementPage } from './trip-management-page';
import { tripApi } from '../../services/trips';

vi.mock('../../auth/session-context', () => ({ useSession: () => ({ user: { roles: ['super-admin'], permissions: [] } }) }));
vi.mock('../../localization/locale-context', () => {
    const t = (key: string) => key;
    return { useLocale: () => ({ t, formatNumber: String, formatDateTime: String }) };
});
vi.mock('../../services/trips', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../services/trips')>()),
    tripApi: {
        create: vi.fn(),
        list: async () => ({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 }, summary: { total: 0, planning: 0, operation: 0, ending: 0 } }),
        options: async () => ({
            warehouses: [{ id: 1, name: 'Main', code: 'WH' }],
            regions: [{ id: 1, warehouse_id: 1, name: 'North' }],
            representatives: [
                { id: 1, primary_warehouse_id: 1, name: 'Aung', code: 'SR1', regions: [{ id: 1 }] },
                { id: 2, primary_warehouse_id: 1, name: 'Su', code: 'SR2', regions: [{ id: 1 }] },
                { id: 3, primary_warehouse_id: 1, name: 'Busy rep', code: 'SR3', regions: [{ id: 1 }], has_active_trip: true },
            ],
            vehicles: [{ id: 9, vehicle_number: 'CAR-9', vehicle_type: 'Van', sales_representative_id: 1 }],
        }),
    },
}));

describe('trip vehicle assignment', () => {
    it('keeps submission errors inside the modal and clears them when reopened', async () => {
        vi.mocked(tripApi.create).mockRejectedValueOnce(new Error('This representative already has an active trip.'));
        render(<MemoryRouter><TripManagementPage /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Plan trip' }));
        const modal = screen.getByRole('dialog');
        const dialog = within(modal);
        await dialog.findByRole('option', { name: /WH.*Main/ });
        fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'Morning trip' } });
        fireEvent.change(dialog.getByRole('combobox', { name: /^Warehouse/ }), { target: { value: '1' } });
        fireEvent.change(dialog.getByRole('combobox', { name: /^Region/ }), { target: { value: '1' } });
        fireEvent.change(dialog.getByRole('combobox', { name: /^Sales representative/ }), { target: { value: '1' } });
        fireEvent.click(dialog.getByRole('button', { name: 'Create trip' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent('This representative already has an active trip.');
        expect(screen.getAllByRole('alert')).toHaveLength(1);
        expect(dialog.getByLabelText('Title')).toHaveValue('Morning trip');
        fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Plan trip' }));
        expect(within(screen.getByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    });

    it('automatically selects the assigned vehicle and clears it for a representative without an available car', async () => {
        render(<MemoryRouter><TripManagementPage /></MemoryRouter>);
        fireEvent.click(screen.getByRole('button', { name: 'Plan trip' }));
        const dialog = within(screen.getByRole('dialog'));
        await dialog.findByRole('option', { name: /WH.*Main/ });
        fireEvent.change(dialog.getByRole('combobox', { name: /^Warehouse/ }), { target: { value: '1' } });
        fireEvent.change(dialog.getByRole('combobox', { name: /^Region/ }), { target: { value: '1' } });
        expect(dialog.queryByRole('option', { name: /Busy rep/ })).not.toBeInTheDocument();
        fireEvent.change(dialog.getByRole('combobox', { name: /^Sales representative/ }), { target: { value: '1' } });
        expect(dialog.getByRole('combobox', { name: /^Vehicle/ })).toHaveValue('9');
        expect(dialog.getByRole('combobox', { name: /^Vehicle/ })).toBeDisabled();
        fireEvent.change(dialog.getByRole('combobox', { name: /^Sales representative/ }), { target: { value: '2' } });
        expect(dialog.getByRole('combobox', { name: /^Vehicle/ })).toHaveValue('0');
        expect(dialog.getByRole('button', { name: 'Create trip' })).toBeDisabled();
    });
});
