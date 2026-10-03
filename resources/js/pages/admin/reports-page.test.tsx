import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ReportsPage } from './reports-page';
import { reportingApi, type ReportResponse } from '../../services/reporting';

vi.mock('../../localization/locale-context', () => {
    const t = (key: string) => key;
    return { useLocale: () => ({ t, formatNumber: String, formatDateTime: String }) };
});
vi.mock('../../services/reporting', () => ({
    reportingApi: { options: vi.fn(), report: vi.fn() },
}));

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it('shows whole purchase quantities without currency and exports them across every page', async () => {
    const response: ReportResponse = {
        report: 'customers',
        data: [
            {
                customer: { id: 1, code: 'C1', name: 'Customer One' },
                warehouse: { id: 1, code: 'WH1', name: 'Main' },
                purchase_count: 2,
                purchase_amount: 800,
                purchase_quantity: 5,
                last_purchase_at: null,
            },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 25, from: 1, to: 1, total: 1 },
        summary: { customers: 1, purchase_amount: 800, purchase_quantity: 5, transactions: 2 },
        rules: {},
    };
    vi.mocked(reportingApi.options).mockResolvedValue({ warehouses: [], reports: ['customers'] });
    vi.mocked(reportingApi.report).mockImplementation(async (report, filters, perPage) => {
        if (report !== 'customers') return { ...response, report, data: [], summary: {} };
        if (perPage !== 100) return response;
        return {
            ...response,
            data:
                filters.page === 2
                    ? [
                          {
                              ...response.data[0],
                              customer: { id: 2, code: 'C2', name: 'Customer Two' },
                              purchase_quantity: 3,
                          },
                      ]
                    : response.data,
            meta: { ...response.meta, current_page: filters.page ?? 1, last_page: 2, total: 2 },
        };
    });
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:customer-report');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ReportsPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Customer analysis' }));
    const table = await screen.findByRole('table');
    expect(
        within(table).getByRole('columnheader', { name: 'Purchase quantity (whole largest units)' }),
    ).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '5' })).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Analysis summary' });
    expect(within(summary).getByText('5')).toBeInTheDocument();
    expect(within(summary).queryByText('5 MMK')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce());
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const csv = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(blob);
    });
    const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toContain('"Last purchase","Purchase quantity (whole largest units)","Purchase amount"');
    expect(lines[1]).toBe('"C1","Customer One","WH1","Main","2","","5","800"');
    expect(lines[2]).toBe('"C2","Customer Two","WH1","Main","2","","3","800"');
});
