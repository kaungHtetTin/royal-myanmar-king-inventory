import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import { customerApi, type Customer } from '../../services/customers';
import { saleApi, type Sale, type SaleSummary } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

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

function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function saleTone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
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

    function applyDateRange(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPage(1);
        setDateRange(draftRange);
    }

    function clearDateRange() {
        setDraftRange(emptyDateRange);
        setPage(1);
        setDateRange(emptyDateRange);
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
        </div>
    );
}
