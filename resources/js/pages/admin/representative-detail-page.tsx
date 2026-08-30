import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { financeApi, type CashSubmission } from '../../services/finance';
import { representativeApi, type RepresentativeOverview } from '../../services/representatives';
import { saleApi, type Sale } from '../../services/sales';
import { transferApi, type RepresentativeInventory } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { EmptyState, MetricCard, Pagination, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const emptyMeta: PaginationMeta = { current_page: 1, from: null, last_page: 1, per_page: 10, to: null, total: 0 };

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (status === 'posted' || status === 'confirmed') return 'success';
    if (status === 'pending' || status === 'draft') return 'warning';
    if (status === 'voided' || status === 'cancelled' || status === 'reversed') return 'danger';
    return 'neutral';
}

export function RepresentativeDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number | null) => (value === null ? t('Restricted') : `${formatNumber(value)} MMK`);
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Not recorded'));
    const representativeId = Number(useParams().representativeId);
    const [overview, setOverview] = useState<RepresentativeOverview | null>(null);
    const [stock, setStock] = useState<RepresentativeInventory[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [submissions, setSubmissions] = useState<CashSubmission[]>([]);
    const [stockMeta, setStockMeta] = useState(emptyMeta);
    const [salesMeta, setSalesMeta] = useState(emptyMeta);
    const [cashMeta, setCashMeta] = useState(emptyMeta);
    const [stockPage, setStockPage] = useState(1);
    const [stockSearch, setStockSearch] = useState('');
    const [stockSearchDraft, setStockSearchDraft] = useState('');
    const [salesPage, setSalesPage] = useState(1);
    const [cashPage, setCashPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(representativeId) || representativeId < 1) {
            setError(t('The representative reference is invalid.'));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const summary = await representativeApi.overview(representativeId);
            setOverview(summary);
            const [stockResponse, salesResponse, cashResponse] = await Promise.all([
                summary.visibility.stock
                    ? transferApi.representativeInventory({
                          page: stockPage,
                          representative_id: representativeId,
                          search: stockSearch || undefined,
                      })
                    : null,
                summary.visibility.sales
                    ? saleApi.adminSales({ page: salesPage, representative_id: representativeId })
                    : null,
                summary.visibility.cash
                    ? financeApi.cashSubmissions({ page: cashPage, representative_id: representativeId })
                    : null,
            ]);
            if (stockResponse) {
                setStock(stockResponse.data);
                setStockMeta(stockResponse.meta);
            }
            if (salesResponse) {
                setSales(salesResponse.data);
                setSalesMeta(salesResponse.meta);
            }
            if (cashResponse) {
                setSubmissions(cashResponse.data);
                setCashMeta(cashResponse.meta);
            }
        } catch (requestError) {
            setError(
                requestError instanceof Error ? requestError.message : t('Unable to load representative details.'),
            );
        } finally {
            setLoading(false);
        }
    }, [cashPage, representativeId, salesPage, stockPage, stockSearch, t]);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    if (!overview && loading) {
        return (
            <div className="ui-loading" role="status">
                <span />
                {t('Loading representative details…')}
            </div>
        );
    }

    if (!overview) {
        return (
            <div className="admin-page">
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                </div>
                <Link className="sale-detail-back" to="/admin/representatives">
                    <Icon name="chevronLeft" size={13} />
                    {t('Back to representatives')}
                </Link>
            </div>
        );
    }

    const representative = overview.representative;
    const maxChart = Math.max(...overview.sales_chart.map((point) => point.amount), 1);

    return (
        <div className="admin-page representative-detail-page">
            <header className="page-heading representative-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/representatives">
                        <Icon name="chevronLeft" size={13} />
                        {t('Representatives')}
                    </Link>
                    <p className="ui-eyebrow">{t('Field performance')}</p>
                    <h1>{representative.name}</h1>
                    <p>
                        {representative.code} · {representative.primary_warehouse.name} ·{' '}
                        {representative.region || t('No region assigned')}
                    </p>
                </div>
                <StatusBadge tone={representative.is_active ? 'success' : 'danger'}>
                    {t(representative.is_active ? 'Active' : 'Inactive')}
                </StatusBadge>
            </header>

            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <section
                aria-label={t('Representative key performance indicators')}
                className="metric-grid representative-detail-kpis"
            >
                <MetricCard
                    hint={t('{count} products currently held', {
                        count: formatNumber(overview.kpis.stock_products ?? 0),
                    })}
                    icon="box"
                    label={t('Stock on hand')}
                    value={
                        overview.kpis.stock_units === null
                            ? t('Restricted')
                            : t('{count} units', { count: formatNumber(overview.kpis.stock_units) })
                    }
                />
                <MetricCard
                    hint={t('{count} posted transactions', {
                        count: formatNumber(overview.kpis.sales_transactions_30_days ?? 0),
                    })}
                    icon="sales"
                    label={t('Sales · 30 days')}
                    value={money(overview.kpis.sales_30_days)}
                />
                <MetricCard
                    hint={t('Current accountable balance')}
                    icon="cash"
                    label={t('Cash held')}
                    value={money(overview.kpis.cash_hold)}
                />
                <MetricCard
                    hint={t('{count} awaiting confirmation', {
                        count: formatNumber(overview.kpis.pending_submission_count ?? 0),
                    })}
                    icon="transfer"
                    label={t('Pending handover')}
                    value={money(overview.kpis.pending_submissions)}
                />
            </section>

            <div className="representative-detail-overview">
                <Panel eyebrow={t('Profile')} title={t('Assignment & contact')}>
                    <dl className="representative-detail-facts">
                        <div>
                            <dt>{t('Warehouse')}</dt>
                            <dd>
                                {representative.primary_warehouse.name}
                                <small>{representative.primary_warehouse.code}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Vehicle')}</dt>
                            <dd>
                                {representative.vehicle?.vehicle_number || t('Unassigned')}
                                <small>{representative.vehicle?.vehicle_type || t('No linked vehicle')}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Phone')}</dt>
                            <dd>{representative.phone || t('Not specified')}</dd>
                        </div>
                        <div>
                            <dt>{t('Email')}</dt>
                            <dd>{representative.email || t('Not specified')}</dd>
                        </div>
                        <div>
                            <dt>{t('Username')}</dt>
                            <dd>
                                @{representative.account.username}
                                <small>
                                    {t('Last login {date}', { date: dateTime(representative.account.last_login_at) })}
                                </small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Notes')}</dt>
                            <dd>{representative.notes || t('No notes recorded')}</dd>
                        </div>
                    </dl>
                </Panel>

                <Panel eyebrow={t('30-day report')} title={t('Posted sales trend')}>
                    {overview.visibility.sales ? (
                        <div
                            className="representative-sales-chart"
                            role="img"
                            aria-label={t('Daily posted sales for the last 30 days')}
                        >
                            {overview.sales_chart.map((point) => (
                                <div
                                    className="representative-sales-chart__bar"
                                    key={point.date}
                                    title={t('{date}: {amount} from {count} sales', {
                                        date: point.date,
                                        amount: money(point.amount),
                                        count: formatNumber(point.transactions),
                                    })}
                                >
                                    <span
                                        style={{
                                            height: `${Math.max(point.amount ? 8 : 2, (point.amount / maxChart) * 100)}%`,
                                        }}
                                    />
                                </div>
                            ))}
                            <div className="representative-sales-chart__axis">
                                <span>{overview.sales_chart[0]?.date}</span>
                                <span>{t('Today')}</span>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title={t('Sales report restricted')}
                            description={t('Sale view permission is required for this chart.')}
                        />
                    )}
                </Panel>
            </div>

            <div className="representative-operations-grid">
                <Panel className="representative-stock-panel" eyebrow={t('Current custody')} title={t('Holding stock')}>
                    {overview.visibility.stock ? (
                        <form
                            className="filter-toolbar representative-stock-filter"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setStockPage(1);
                                setStockSearch(stockSearchDraft.trim());
                            }}
                            role="search"
                        >
                            <label className="filter-search">
                                <span className="sr-only">{t('Search holding stock products')}</span>
                                <Icon name="search" size={15} />
                                <input
                                    onChange={(event) => setStockSearchDraft(event.target.value)}
                                    placeholder={t('Search product name or SKU')}
                                    type="search"
                                    value={stockSearchDraft}
                                />
                            </label>
                            <button className="ui-button ui-button--secondary" disabled={loading} type="submit">
                                {t('Search')}
                            </button>
                        </form>
                    ) : null}
                    {!overview.visibility.stock ? (
                        <EmptyState
                            title={t('Stock restricted')}
                            description={t('Representative stock permission is required.')}
                        />
                    ) : stock.length === 0 ? (
                        <EmptyState
                            title={t(stockSearch ? 'No matching products' : 'No stock held')}
                            description={t(
                                stockSearch ? 'Try another product name or SKU.' : 'Issued products will appear here.',
                            )}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table representative-detail-table">
                                <thead>
                                    <tr>
                                        <th>{t('Product')}</th>
                                        <th className="is-numeric">{t('Paid base')}</th>
                                        <th className="is-numeric">{t('FOC base')}</th>
                                        <th className="is-numeric">{t('Incoming base')}</th>
                                        <th>{t('Updated')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stock.map((row) => (
                                        <tr key={row.id}>
                                            <td>
                                                <strong>{row.product.name}</strong>
                                                <small>
                                                    {row.product.sku} · {row.product.unit}
                                                </small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{formatNumber(row.quantity)}</strong>
                                                <small>{row.product.base_unit ?? row.product.unit}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{formatNumber(row.foc_quantity)}</strong>
                                                <small>{row.product.base_unit ?? row.product.unit}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{formatNumber(row.pending_quantity)}</strong>
                                                <small>{row.product.base_unit ?? row.product.unit}</small>
                                            </td>
                                            <td>{dateTime(row.updated_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination
                        label={t('Holding stock')}
                        loading={loading}
                        meta={stockMeta}
                        onPageChange={setStockPage}
                    />
                </Panel>

                <Panel
                    className="representative-cash-panel"
                    eyebrow={t('Office settlement')}
                    title={t('Cash submission history')}
                >
                    {!overview.visibility.cash ? (
                        <EmptyState
                            title={t('Cash history restricted')}
                            description={t('Cash view permission is required.')}
                        />
                    ) : submissions.length === 0 ? (
                        <EmptyState
                            title={t('No cash submissions')}
                            description={t('Submitted handovers will appear here.')}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table representative-cash-history">
                                <thead>
                                    <tr>
                                        <th>{t('Submission')}</th>
                                        <th className="is-numeric">{t('Amount')}</th>
                                        <th>{t('Status')}</th>
                                        <th>{t('Submitted by')}</th>
                                        <th>{t('Confirmation')}</th>
                                        <th>{t('Notes')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {submissions.map((submission) => (
                                        <tr key={submission.id}>
                                            <td>
                                                <strong>{submission.reference}</strong>
                                                <small>{dateTime(submission.created_at)}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{money(submission.amount)}</strong>
                                            </td>
                                            <td>
                                                <StatusBadge tone={statusTone(submission.status)}>
                                                    {t(submission.status)}
                                                </StatusBadge>
                                            </td>
                                            <td>{submission.created_by?.name || t('System')}</td>
                                            <td>
                                                {submission.confirmed_at
                                                    ? dateTime(submission.confirmed_at)
                                                    : t('Awaiting office')}
                                            </td>
                                            <td>{submission.notes || t('—')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination
                        label={t('Cash submission history')}
                        loading={loading}
                        meta={cashMeta}
                        onPageChange={setCashPage}
                    />
                </Panel>
            </div>

            <Panel className="representative-sales-panel" eyebrow={t('Commercial activity')} title={t('Sale history')}>
                {!overview.visibility.sales ? (
                    <EmptyState title={t('Sales restricted')} description={t('Sale view permission is required.')} />
                ) : sales.length === 0 ? (
                    <EmptyState title={t('No sales found')} description={t('Representative sales will appear here.')} />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table representative-detail-table">
                            <thead>
                                <tr>
                                    <th>{t('Sale')}</th>
                                    <th>{t('Customer')}</th>
                                    <th>{t('Payment')}</th>
                                    <th className="is-numeric">{t('Amount')}</th>
                                    <th>{t('Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map((sale) => (
                                    <tr key={sale.id}>
                                        <td>
                                            <strong>{sale.reference}</strong>
                                            <small>{dateTime(sale.posted_at || sale.created_at)}</small>
                                        </td>
                                        <td>
                                            <strong>{sale.customer.name}</strong>
                                            <small>{sale.customer.code}</small>
                                        </td>
                                        <td>{t(sale.payment_type)}</td>
                                        <td className="is-numeric">
                                            <strong>{money(sale.total_amount)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={statusTone(sale.status)}>{t(sale.status)}</StatusBadge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination label={t('Sale history')} loading={loading} meta={salesMeta} onPageChange={setSalesPage} />
            </Panel>
        </div>
    );
}
