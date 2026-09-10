import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import { Link } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { saleApi, type Sale, type SaleFilters, type SaleSummary } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { InvoicePrintButton } from '../../ui/invoice-print-dialog';
import { Button, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
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
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
function tone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

export function SalesManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const { user } = useSession();
    const canVoid = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('sale.void'));
    const [rows, setRows] = useState<Sale[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [filters, setFilters] = useState<SaleFilters>({ page: 1 });
    const [draft, setDraft] = useState({
        date_from: '',
        date_to: '',
        payment_type: '',
        period: '',
        search: '',
        status: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await saleApi.adminSales(filters);
            setRows(response.data);
            setMeta(response.meta);
            setSummary(response.summary ?? emptySummary);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load sales.')));
        } finally {
            setLoading(false);
        }
    }, [filters, t]);
    useEffect(() => {
        let active = true;
        void saleApi
            .adminSales(filters)
            .then((response) => {
                if (!active) return;
                setRows(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load sales.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filters, t]);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        setFilters({
            ...draft,
            date_from: draft.period === 'custom' ? draft.date_from : undefined,
            date_to: draft.period === 'custom' ? draft.date_to : undefined,
            page: 1,
            period: draft.period === 'custom' ? undefined : draft.period,
        });
    };
    const voidSale = async (sale: Sale) => {
        const reason = window.prompt(
            t('Reason for voiding {reference}? Stock and financial effects will be reversed.', {
                reference: sale.reference,
            }),
        );
        if (!reason?.trim()) return;
        setLoading(true);
        try {
            await saleApi.void(sale.id, reason.trim());
            await load();
            setNotice(t('{reference} voided with compensating entries.', { reference: sale.reference }));
            window.setTimeout(() => setNotice(''), 4500);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load sales.')));
            setLoading(false);
        }
    };
    return (
        <div className="admin-page sales-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Customer transactions')}</p>
                    <h1>{t('Sales')}</h1>
                    <p>
                        {t(
                            'Review representative sales, payment effects, immutable lines, and controlled reversals across assigned warehouses.',
                        )}
                    </p>
                </div>
            </header>
            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="sales"
                    label={t('Sales records')}
                    value={formatNumber(summary.total)}
                />
                <MetricCard
                    hint={t('Posted sales in current filtered result')}
                    icon="reports"
                    label={t('Posted total')}
                    value={money(summary.posted_total)}
                />
                <MetricCard
                    hint={t('Current filtered posted sales')}
                    icon="cash"
                    label={t('Cash')}
                    value={money(summary.cash_total)}
                />
                <MetricCard
                    hint={t('Current filtered posted sales')}
                    icon="customers"
                    label={t('Credit')}
                    value={money(summary.credit_total)}
                />
            </div>
            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="sales" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            <Panel eyebrow={t('Sales register')} title={t('Representative sales')}>
                <form className="filter-toolbar sales-filters" onSubmit={submit}>
                    <div className="sales-filter-scroll">
                        <div className="sales-filter-fields">
                            <label className="filter-search">
                                <Icon name="search" size={15} />
                                <input
                                    aria-label={t('Search sale reference')}
                                    onChange={(event) =>
                                        setDraft((value) => ({ ...value, search: event.target.value }))
                                    }
                                    placeholder={t('Sale reference')}
                                    type="search"
                                    value={draft.search}
                                />
                            </label>
                            <select
                                aria-label={t('Sale status')}
                                onChange={(event) => setDraft((value) => ({ ...value, status: event.target.value }))}
                                value={draft.status}
                            >
                                <option value="">{t('All statuses')}</option>
                                <option value="draft">{t('Draft')}</option>
                                <option value="posted">{t('Posted')}</option>
                                <option value="voided">{t('Voided')}</option>
                            </select>
                            <select
                                aria-label={t('Sale duration')}
                                onChange={(event) => setDraft((value) => ({ ...value, period: event.target.value }))}
                                value={draft.period}
                            >
                                <option value="">{t('All time')}</option>
                                <option value="today">{t('Today')}</option>
                                <option value="7_days">{t('Last 7 days')}</option>
                                <option value="30_days">{t('Last 30 days')}</option>
                                <option value="this_month">{t('This month')}</option>
                                <option value="custom">{t('Custom range')}</option>
                            </select>
                            {draft.period === 'custom' ? (
                                <>
                                    <label className="report-date">
                                        <span>{t('From')}</span>
                                        <input
                                            aria-label={t('Sale date from')}
                                            max={draft.date_to || undefined}
                                            onChange={(event) =>
                                                setDraft((value) => ({ ...value, date_from: event.target.value }))
                                            }
                                            required
                                            type="date"
                                            value={draft.date_from}
                                        />
                                    </label>
                                    <label className="report-date">
                                        <span>{t('To')}</span>
                                        <input
                                            aria-label={t('Sale date to')}
                                            min={draft.date_from || undefined}
                                            onChange={(event) =>
                                                setDraft((value) => ({ ...value, date_to: event.target.value }))
                                            }
                                            required
                                            type="date"
                                            value={draft.date_to}
                                        />
                                    </label>
                                </>
                            ) : null}
                            <select
                                aria-label={t('Payment type')}
                                onChange={(event) =>
                                    setDraft((value) => ({ ...value, payment_type: event.target.value }))
                                }
                                value={draft.payment_type}
                            >
                                <option value="">{t('All payments')}</option>
                                <option value="cash">{t('Cash')}</option>
                                <option value="credit">{t('Credit')}</option>
                            </select>
                        </div>
                    </div>
                    <Button icon="search" type="submit">
                        {t('Apply')}
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        {t('Loading sales…')}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        description={t('No sales match the current warehouse scope and filters.')}
                        title={t('No sales found')}
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table admin-sales-table">
                            <thead>
                                <tr>
                                    <th>{t('Sale')}</th>
                                    <th>{t('Representative')}</th>
                                    <th>{t('Customer')}</th>
                                    <th>{t('Products')}</th>
                                    <th>{t('Payment')}</th>
                                    <th className="is-numeric">{t('Cashback amount')}</th>
                                    <th className="is-numeric">{t('Total')}</th>
                                    <th>{t('Status')}</th>
                                    <th className="ui-table__actions">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((sale) => (
                                    <tr key={sale.id}>
                                        <td>
                                            <strong>
                                                <Link
                                                    className="inventory-reference-link"
                                                    to={`/admin/sales/${sale.id}`}
                                                >
                                                    {sale.reference}
                                                </Link>
                                            </strong>
                                            <small>{dateTime(sale.created_at)}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{sale.representative.name}</span>
                                            <small>
                                                {sale.representative.code} · {sale.warehouse.code}
                                            </small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{sale.customer.name}</span>
                                            <small>{sale.customer.code}</small>
                                        </td>
                                        <td>
                                            <strong>
                                                {sale.items.length} / {sale.total_quantity}
                                            </strong>
                                            <small>
                                                {sale.items
                                                    .map((item) => `${item.product.sku} × ${item.quantity}`)
                                                    .join(', ')}
                                            </small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{t(sale.payment_type)}{sale.payment_method_name ? ` · ${sale.payment_method_name}` : ''}</span>
                                            <small>
                                                {t(sale.payment_type === 'credit' ? 'Outstanding credit' : sale.adds_to_cash_hold ? 'Cash hold' : 'Direct / banking')}
                                            </small>
                                        </td>
                                        <td className="is-numeric">
                                            {sale.cashback_amount ? `-${money(sale.cashback_amount)}` : '—'}
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{money(sale.total_amount)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={tone(sale.status)}>{t(sale.status)}</StatusBadge>
                                        </td>
                                        <td className="ui-table__actions">
                                            <div className="row-actions">
                                                {sale.status !== 'draft' ? (
                                                    <InvoicePrintButton
                                                        iconOnly
                                                        onBlocked={() =>
                                                            setError(t('Allow pop-ups to print the invoice.'))
                                                        }
                                                        sale={sale}
                                                    />
                                                ) : null}
                                                {sale.status === 'posted' && canVoid ? (
                                                    <IconButton
                                                        icon="reverse"
                                                        label={t('Void {reference}', { reference: sale.reference })}
                                                        onClick={() => void voidSale(sale)}
                                                        requiresOnline
                                                        tone="danger"
                                                    />
                                                ) : null}
                                            </div>
                                            {sale.status === 'voided' ? <small>{sale.void_reason}</small> : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <footer className="table-footer">
                    <span>
                        {t('{from}–{to} of {total}', {
                            from: formatNumber(meta.from ?? 0),
                            to: formatNumber(meta.to ?? 0),
                            total: formatNumber(meta.total),
                        })}
                    </span>
                    <button
                        disabled={meta.current_page <= 1 || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page - 1,
                            }))
                        }
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
                        disabled={meta.current_page >= meta.last_page || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page + 1,
                            }))
                        }
                    >
                        {t('Next')}
                    </button>
                </footer>
            </Panel>
        </div>
    );
}
