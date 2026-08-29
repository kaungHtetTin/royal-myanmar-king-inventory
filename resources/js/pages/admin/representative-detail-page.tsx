import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { financeApi, type CashSubmission } from '../../services/finance';
import { representativeApi, type RepresentativeOverview } from '../../services/representatives';
import { saleApi, type Sale } from '../../services/sales';
import { transferApi, type RepresentativeInventory } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { EmptyState, MetricCard, Pagination, Panel, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = { current_page: 1, from: null, last_page: 1, per_page: 10, to: null, total: 0 };

function money(value: number | null) {
    return value === null ? 'Restricted' : `${new Intl.NumberFormat().format(value)} MMK`;
}

function dateTime(value: string | null) {
    if (!value) return 'Not recorded';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
    if (status === 'posted' || status === 'confirmed') return 'success';
    if (status === 'pending' || status === 'draft') return 'warning';
    if (status === 'voided' || status === 'cancelled' || status === 'reversed') return 'danger';
    return 'neutral';
}

export function RepresentativeDetailPage() {
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
            setError('The representative reference is invalid.');
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
                summary.visibility.cash ? financeApi.cashSubmissions(cashPage, representativeId) : null,
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
            setError(requestError instanceof Error ? requestError.message : 'Unable to load representative details.');
        } finally {
            setLoading(false);
        }
    }, [cashPage, representativeId, salesPage, stockPage, stockSearch]);

    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    if (!overview && loading) {
        return (
            <div className="ui-loading" role="status">
                <span />
                Loading representative details…
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
                    Back to representatives
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
                        Representatives
                    </Link>
                    <p className="ui-eyebrow">Field performance</p>
                    <h1>{representative.name}</h1>
                    <p>
                        {representative.code} · {representative.primary_warehouse.name} ·{' '}
                        {representative.region || 'No region assigned'}
                    </p>
                </div>
                <StatusBadge tone={representative.is_active ? 'success' : 'danger'}>
                    {representative.is_active ? 'Active' : 'Inactive'}
                </StatusBadge>
            </header>

            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            ) : null}

            <section
                aria-label="Representative key performance indicators"
                className="metric-grid representative-detail-kpis"
            >
                <MetricCard
                    hint={`${overview.kpis.stock_products ?? 0} products currently held`}
                    icon="box"
                    label="Stock on hand"
                    value={overview.kpis.stock_units === null ? 'Restricted' : `${overview.kpis.stock_units} units`}
                />
                <MetricCard
                    hint={`${overview.kpis.sales_transactions_30_days ?? 0} posted transactions`}
                    icon="sales"
                    label="Sales · 30 days"
                    value={money(overview.kpis.sales_30_days)}
                />
                <MetricCard
                    hint="Current accountable balance"
                    icon="cash"
                    label="Cash held"
                    value={money(overview.kpis.cash_hold)}
                />
                <MetricCard
                    hint={`${overview.kpis.pending_submission_count ?? 0} awaiting confirmation`}
                    icon="transfer"
                    label="Pending handover"
                    value={money(overview.kpis.pending_submissions)}
                />
            </section>

            <div className="representative-detail-overview">
                <Panel eyebrow="Profile" title="Assignment & contact">
                    <dl className="representative-detail-facts">
                        <div>
                            <dt>Warehouse</dt>
                            <dd>
                                {representative.primary_warehouse.name}
                                <small>{representative.primary_warehouse.code}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Vehicle</dt>
                            <dd>
                                {representative.vehicle?.vehicle_number || 'Unassigned'}
                                <small>{representative.vehicle?.vehicle_type || 'No linked vehicle'}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Phone</dt>
                            <dd>{representative.phone || 'Not specified'}</dd>
                        </div>
                        <div>
                            <dt>Email</dt>
                            <dd>{representative.email || 'Not specified'}</dd>
                        </div>
                        <div>
                            <dt>Username</dt>
                            <dd>
                                @{representative.account.username}
                                <small>Last login {dateTime(representative.account.last_login_at)}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Notes</dt>
                            <dd>{representative.notes || 'No notes recorded'}</dd>
                        </div>
                    </dl>
                </Panel>

                <Panel eyebrow="30-day report" title="Posted sales trend">
                    {overview.visibility.sales ? (
                        <div
                            className="representative-sales-chart"
                            role="img"
                            aria-label="Daily posted sales for the last 30 days"
                        >
                            {overview.sales_chart.map((point) => (
                                <div
                                    className="representative-sales-chart__bar"
                                    key={point.date}
                                    title={`${point.date}: ${money(point.amount)} from ${point.transactions} sales`}
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
                                <span>Today</span>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title="Sales report restricted"
                            description="Sale view permission is required for this chart."
                        />
                    )}
                </Panel>
            </div>

            <div className="representative-operations-grid">
                <Panel className="representative-stock-panel" eyebrow="Current custody" title="Holding stock">
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
                                <span className="sr-only">Search holding stock products</span>
                                <Icon name="search" size={15} />
                                <input
                                    onChange={(event) => setStockSearchDraft(event.target.value)}
                                    placeholder="Search product name or SKU"
                                    type="search"
                                    value={stockSearchDraft}
                                />
                            </label>
                            <button className="ui-button ui-button--secondary" disabled={loading} type="submit">
                                Search
                            </button>
                        </form>
                    ) : null}
                    {!overview.visibility.stock ? (
                        <EmptyState
                            title="Stock restricted"
                            description="Representative stock permission is required."
                        />
                    ) : stock.length === 0 ? (
                        <EmptyState
                            title={stockSearch ? 'No matching products' : 'No stock held'}
                            description={
                                stockSearch ? 'Try another product name or SKU.' : 'Issued products will appear here.'
                            }
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table representative-detail-table">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th className="is-numeric">Paid base</th>
                                        <th className="is-numeric">FOC base</th>
                                        <th className="is-numeric">Incoming base</th>
                                        <th>Updated</th>
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
                                                <strong>{row.quantity}</strong>
                                                <small>{row.product.base_unit ?? row.product.unit}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{row.foc_quantity}</strong>
                                                <small>{row.product.base_unit ?? row.product.unit}</small>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{row.pending_quantity}</strong>
                                                <small>{row.product.base_unit ?? row.product.unit}</small>
                                            </td>
                                            <td>{dateTime(row.updated_at)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination label="Holding stock" loading={loading} meta={stockMeta} onPageChange={setStockPage} />
                </Panel>

                <Panel
                    className="representative-cash-panel"
                    eyebrow="Office settlement"
                    title="Cash submission history"
                >
                    {!overview.visibility.cash ? (
                        <EmptyState title="Cash history restricted" description="Cash view permission is required." />
                    ) : submissions.length === 0 ? (
                        <EmptyState title="No cash submissions" description="Submitted handovers will appear here." />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table representative-cash-history">
                                <thead>
                                    <tr>
                                        <th>Submission</th>
                                        <th className="is-numeric">Amount</th>
                                        <th>Status</th>
                                        <th>Submitted by</th>
                                        <th>Confirmation</th>
                                        <th>Notes</th>
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
                                                    {submission.status}
                                                </StatusBadge>
                                            </td>
                                            <td>{submission.created_by?.name || 'System'}</td>
                                            <td>
                                                {submission.confirmed_at
                                                    ? dateTime(submission.confirmed_at)
                                                    : 'Awaiting office'}
                                            </td>
                                            <td>{submission.notes || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination
                        label="Cash submission history"
                        loading={loading}
                        meta={cashMeta}
                        onPageChange={setCashPage}
                    />
                </Panel>
            </div>

            <Panel className="representative-sales-panel" eyebrow="Commercial activity" title="Sale history">
                {!overview.visibility.sales ? (
                    <EmptyState title="Sales restricted" description="Sale view permission is required." />
                ) : sales.length === 0 ? (
                    <EmptyState title="No sales found" description="Representative sales will appear here." />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table representative-detail-table">
                            <thead>
                                <tr>
                                    <th>Sale</th>
                                    <th>Customer</th>
                                    <th>Payment</th>
                                    <th className="is-numeric">Amount</th>
                                    <th>Status</th>
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
                                        <td>{sale.payment_type}</td>
                                        <td className="is-numeric">
                                            <strong>{money(sale.total_amount)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={statusTone(sale.status)}>{sale.status}</StatusBadge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination label="Sale history" loading={loading} meta={salesMeta} onPageChange={setSalesPage} />
            </Panel>
        </div>
    );
}
