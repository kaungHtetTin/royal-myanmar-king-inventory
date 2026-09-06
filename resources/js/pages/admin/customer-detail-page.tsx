import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import { customerApi, type Customer, type CustomerSaleReportProduct } from '../../services/customers';
import { saleApi, type Sale, type SaleSummary } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';
import { formatSellingUnitEquivalent } from '../../ui/selling-unit-equivalent';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptySummary: SaleSummary = { cash_total: 0, credit_total: 0, posted_total: 0, total: 0 };
type DateRange = { date_from: string; date_to: string };
const emptyDateRange: DateRange = { date_from: '', date_to: '' };
const emptyReportSummary = { foc_quantity: 0, products: 0, purchased_quantity: 0, total_quantity: 0 };

function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function saleTone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function CustomerDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const { customerId } = useParams();
    const { user } = useSession();
    const id = Number(customerId);
    const canViewSales = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('sale.view'));
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [sales, setSales] = useState<Sale[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [page, setPage] = useState(1);
    const [draftRange, setDraftRange] = useState<DateRange>(emptyDateRange);
    const [dateRange, setDateRange] = useState<DateRange>(emptyDateRange);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [salesTab, setSalesTab] = useState<'history' | 'report'>('history');
    const [report, setReport] = useState<CustomerSaleReportProduct[]>([]);
    const [reportSummary, setReportSummary] = useState(emptyReportSummary);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportError, setReportError] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError(t('Invalid customer reference.'));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [customerResponse, salesResponse] = await Promise.all([
                customerApi.get(id),
                canViewSales
                    ? saleApi.adminSales({
                          customer_id: id,
                          date_from: dateRange.date_from || undefined,
                          date_to: dateRange.date_to || undefined,
                          page,
                      })
                    : Promise.resolve(null),
            ]);
            setCustomer(customerResponse.data);
            if (salesResponse) {
                setSales(salesResponse.data);
                setMeta(salesResponse.meta);
                setSummary(salesResponse.summary ?? emptySummary);
            }
        } catch (requestError) {
            setError(message(requestError, t('Unable to load customer details.')));
        } finally {
            setLoading(false);
        }
    }, [canViewSales, dateRange.date_from, dateRange.date_to, id, page, t]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (salesTab !== 'report' || !canViewSales || !Number.isInteger(id) || id < 1) return;

        let active = true;
        void customerApi
            .saleReport(id, {
                date_from: dateRange.date_from || undefined,
                date_to: dateRange.date_to || undefined,
            })
            .then((response) => {
                if (!active) return;
                setReport(response.data);
                setReportSummary(response.summary);
            })
            .catch((requestError: unknown) => {
                if (active) setReportError(message(requestError, t('Unable to load the customer sale report.')));
            })
            .finally(() => {
                if (active) setReportLoading(false);
            });

        return () => {
            active = false;
        };
    }, [canViewSales, dateRange.date_from, dateRange.date_to, id, salesTab, t]);

    function applyDateRange(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (
            salesTab === 'report' &&
            (draftRange.date_from !== dateRange.date_from || draftRange.date_to !== dateRange.date_to)
        ) {
            setReportLoading(true);
            setReportError('');
        }
        setPage(1);
        setDateRange(draftRange);
    }

    function clearDateRange() {
        if (salesTab === 'report' && (dateRange.date_from || dateRange.date_to)) {
            setReportLoading(true);
            setReportError('');
        }
        setDraftRange(emptyDateRange);
        setPage(1);
        setDateRange(emptyDateRange);
    }

    function exportSaleReport() {
        const equivalent = (quantity: number, item: CustomerSaleReportProduct) =>
            formatSellingUnitEquivalent(quantity, item.product, formatNumber);
        const dateSuffix = [dateRange.date_from, dateRange.date_to].filter(Boolean).join('_to_');
        downloadCsv(
            `${customer?.code ?? 'customer'}-sale-report${dateSuffix ? `-${dateSuffix}` : ''}.csv`,
            ['Product', 'SKU', 'Purchased', 'FOC', 'Total received', 'Net amount'].map((label) => t(label)),
            report.map((item) => [
                item.product.name,
                item.product.sku,
                equivalent(item.purchased_quantity, item),
                equivalent(item.foc_quantity, item),
                equivalent(item.total_quantity, item),
                item.net_amount,
            ]),
        );
    }

    if (loading && !customer) {
        return (
            <div className="ui-loading" role="status">
                <span />
                {t('Loading customer details…')}
            </div>
        );
    }

    if (!customer) {
        return (
            <div className="admin-page customer-detail-page">
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error || t('Customer not found.')}
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page customer-detail-page">
            <header className="page-heading representative-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/customers">
                        <Icon name="chevronLeft" size={13} />
                        {t('Customers')}
                    </Link>
                    <p className="ui-eyebrow">{t('Customer profile')}</p>
                    <h1>{customer.name}</h1>
                    <p>
                        {customer.code} · {customer.customer_type || t('Customer')} · {customer.warehouse.name}
                    </p>
                </div>
                <StatusBadge tone={customer.is_active ? 'success' : 'danger'}>
                    {t(customer.is_active ? 'Active' : 'Inactive')}
                </StatusBadge>
            </header>

            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            {canViewSales ? (
                <form
                    aria-label={t('Filter customer sales by date')}
                    className="filter-toolbar customer-detail-filters"
                    onSubmit={applyDateRange}
                >
                    <label>
                        <span>{t('From date')}</span>
                        <input
                            aria-label={t('Customer sales from date')}
                            max={draftRange.date_to || undefined}
                            onChange={(event) =>
                                setDraftRange((value) => ({ ...value, date_from: event.target.value }))
                            }
                            type="date"
                            value={draftRange.date_from}
                        />
                    </label>
                    <label>
                        <span>{t('To date')}</span>
                        <input
                            aria-label={t('Customer sales to date')}
                            min={draftRange.date_from || undefined}
                            onChange={(event) => setDraftRange((value) => ({ ...value, date_to: event.target.value }))}
                            type="date"
                            value={draftRange.date_to}
                        />
                    </label>
                    <div className="customer-detail-filters__actions">
                        {dateRange.date_from || dateRange.date_to ? (
                            <Button disabled={loading} onClick={clearDateRange} tone="ghost">
                                {t('Clear')}
                            </Button>
                        ) : null}
                        <Button disabled={loading} icon="search" tone="primary" type="submit">
                            {t('Apply')}
                        </Button>
                    </div>
                </form>
            ) : null}

            <section aria-label={t('Customer sales summary')} className="metric-grid customer-detail-kpis">
                <MetricCard
                    hint={
                        dateRange.date_from || dateRange.date_to
                            ? t('Within selected date range')
                            : t('All recorded transactions')
                    }
                    icon="sales"
                    label={t('Sales')}
                    value={canViewSales ? formatNumber(summary.total) : t('Restricted')}
                />
                <MetricCard
                    hint={t('Posted sales value')}
                    icon="cash"
                    label={t('Posted total')}
                    value={canViewSales ? money(summary.posted_total) : t('Restricted')}
                />
                <MetricCard
                    hint={t(customer.credit_allowed ? 'Office credit enabled' : 'Cash-only customer')}
                    icon="cash"
                    label={t('Credit limit')}
                    value={customer.credit_allowed ? money(customer.credit_limit) : t('Cash only')}
                />
            </section>

            <Panel eyebrow={t('Profile')} title={t('Basic information')}>
                <dl className="customer-detail-facts">
                    <div>
                        <dt>{t('Customer code')}</dt>
                        <dd>{customer.code}</dd>
                    </div>
                    <div>
                        <dt>{t('Type')}</dt>
                        <dd>{customer.customer_type || t('Not specified')}</dd>
                    </div>
                    <div>
                        <dt>{t('Phone')}</dt>
                        <dd>{customer.phone || t('Not specified')}</dd>
                    </div>
                    <div>
                        <dt>{t('Warehouse')}</dt>
                        <dd>
                            {customer.warehouse.name}
                            <small>{customer.warehouse.code}</small>
                        </dd>
                    </div>
                    <div>
                        <dt>{t('Location')}</dt>
                        <dd>{[customer.township, customer.region].filter(Boolean).join(', ') || t('Not specified')}</dd>
                    </div>
                    <div>
                        <dt>{t('Address')}</dt>
                        <dd>{customer.address || t('Not specified')}</dd>
                    </div>
                    <div>
                        <dt>{t('Notes')}</dt>
                        <dd>{customer.notes || t('No notes recorded')}</dd>
                    </div>
                    <div>
                        <dt>{t('Created')}</dt>
                        <dd>
                            {dateTime(customer.created_at)}
                            <small>{t('Updated {date}', { date: dateTime(customer.updated_at) })}</small>
                        </dd>
                    </div>
                </dl>
            </Panel>

            <nav
                aria-label={t('Customer sales sections')}
                className="section-tabs trip-tabs customer-sales-tabs"
                role="tablist"
            >
                <button
                    aria-selected={salesTab === 'history'}
                    onClick={() => setSalesTab('history')}
                    role="tab"
                    type="button"
                >
                    <Icon name="sales" size={15} />
                    {t('Sale history')}
                </button>
                <button
                    aria-selected={salesTab === 'report'}
                    onClick={() => {
                        if (salesTab !== 'report') {
                            setReportLoading(true);
                            setReportError('');
                            setSalesTab('report');
                        }
                    }}
                    role="tab"
                    type="button"
                >
                    <Icon name="reports" size={15} />
                    {t('Sale Report')}
                </button>
            </nav>

            {salesTab === 'history' ? (
                <Panel eyebrow={t('Transactions')} title={t('Sale history')}>
                    {!canViewSales ? (
                        <EmptyState
                            title={t('Sales history restricted')}
                            description={t('Sale view permission is required.')}
                        />
                    ) : sales.length === 0 ? (
                        <EmptyState
                            title={t('No sales found')}
                            description={
                                dateRange.date_from || dateRange.date_to
                                    ? t('No customer sales fall within the selected date range.')
                                    : t("This customer's sales will appear here.")
                            }
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table customer-detail-sales-table">
                                <thead>
                                    <tr>
                                        <th>{t('Reference')}</th>
                                        <th>{t('Representative')}</th>
                                        <th>{t('Payment')}</th>
                                        <th className="is-numeric">{t('Quantity')}</th>
                                        <th className="is-numeric">{t('Total')}</th>
                                        <th>{t('Status')}</th>
                                        <th>{t('Date')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.map((sale) => (
                                        <tr key={sale.id}>
                                            <td>
                                                <strong>{sale.reference}</strong>
                                                <small>{sale.warehouse.code}</small>
                                            </td>
                                            <td>
                                                <strong>{sale.representative.name}</strong>
                                                <small>{sale.representative.code}</small>
                                            </td>
                                            <td>{t(sale.payment_type === 'cash' ? 'Cash' : 'Credit')}</td>
                                            <td className="is-numeric">{formatNumber(sale.total_quantity)}</td>
                                            <td className="is-numeric">
                                                <strong>{money(sale.total_amount)}</strong>
                                            </td>
                                            <td>
                                                <StatusBadge tone={saleTone(sale.status)}>{t(sale.status)}</StatusBadge>
                                            </td>
                                            <td>{dateTime(sale.posted_at ?? sale.created_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {canViewSales ? (
                        <footer className="table-footer">
                            <span>
                                {t('{from}–{to} of {total} sales', {
                                    from: formatNumber(meta.from ?? 0),
                                    to: formatNumber(meta.to ?? 0),
                                    total: formatNumber(meta.total),
                                })}
                            </span>
                            <button
                                disabled={page <= 1 || loading}
                                onClick={() => setPage((value) => value - 1)}
                                type="button"
                            >
                                {t('Previous')}
                            </button>
                            <strong>
                                {t('Page {current} of {last}', {
                                    current: formatNumber(meta.current_page),
                                    last: formatNumber(meta.last_page),
                                })}
                            </strong>
                            <button
                                disabled={page >= meta.last_page || loading}
                                onClick={() => setPage((value) => value + 1)}
                                type="button"
                            >
                                {t('Next')}
                            </button>
                        </footer>
                    ) : null}
                </Panel>
            ) : (
                <Panel
                    actions={
                        canViewSales ? (
                            <Button
                                disabled={reportLoading || report.length === 0}
                                icon="download"
                                onClick={exportSaleReport}
                            >
                                {t('Export CSV')}
                            </Button>
                        ) : undefined
                    }
                    className="customer-sale-report-panel"
                    eyebrow={t('Transactions')}
                    title={t('Sale Report')}
                >
                    {!canViewSales ? (
                        <EmptyState
                            title={t('Sale report restricted')}
                            description={t('Sale view permission is required.')}
                        />
                    ) : reportError ? (
                        <div className="ui-flash ui-flash--danger" role="alert">
                            {reportError}
                        </div>
                    ) : reportLoading ? (
                        <div className="ui-loading" role="status">
                            <span />
                            {t('Loading sale report…')}
                        </div>
                    ) : report.length === 0 ? (
                        <EmptyState
                            title={t('No purchased products found')}
                            description={
                                dateRange.date_from || dateRange.date_to
                                    ? t('No posted sales fall within the selected date range.')
                                    : t("This customer's purchased products will appear here.")
                            }
                        />
                    ) : (
                        <>
                            <div className="customer-sale-report-summary" aria-label={t('Sale report summary')}>
                                <span>{t('{count} products', { count: formatNumber(reportSummary.products) })}</span>
                                <small>
                                    {dateRange.date_from || dateRange.date_to
                                        ? t('Within selected date range')
                                        : t('All posted sales')}
                                </small>
                            </div>
                            <div className="ui-table-wrap">
                                <table className="ui-table customer-sale-report-table">
                                    <thead>
                                        <tr>
                                            <th>{t('Product')}</th>
                                            <th>{t('SKU')}</th>
                                            <th className="is-numeric">{t('Purchased')}</th>
                                            <th className="is-numeric">{t('FOC')}</th>
                                            <th className="is-numeric">{t('Total received')}</th>
                                            <th className="is-numeric">{t('Net amount')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.map((item) => (
                                            <tr key={item.product.id}>
                                                <td>
                                                    <strong>{item.product.name}</strong>
                                                </td>
                                                <td>{item.product.sku}</td>
                                                <td className="is-numeric">
                                                    {formatSellingUnitEquivalent(
                                                        item.purchased_quantity,
                                                        item.product,
                                                        formatNumber,
                                                    )}
                                                </td>
                                                <td className="is-numeric">
                                                    {formatSellingUnitEquivalent(
                                                        item.foc_quantity,
                                                        item.product,
                                                        formatNumber,
                                                    )}
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>
                                                        {formatSellingUnitEquivalent(
                                                            item.total_quantity,
                                                            item.product,
                                                            formatNumber,
                                                        )}
                                                    </strong>
                                                </td>
                                                <td className="is-numeric"><strong>{money(item.net_amount)}</strong></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </Panel>
            )}
        </div>
    );
}
