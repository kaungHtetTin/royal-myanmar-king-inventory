import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportingApi, type SalesDashboard } from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { EmptyState, StatusBadge } from '../../ui/primitives';

const empty: SalesDashboard = {
    as_of: '',
    representative: { id: 0, code: '', name: '' },
    kpis: {
        stock_units: 0,
        stock_products: 0,
        pending_receivings: 0,
        today_sales: 0,
        today_cash_sales: 0,
        today_credit_sales: 0,
        cash_hold: 0,
    },
    stock: [],
    recent_sales: [],
    pending_receivings: [],
};
function money(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load dashboard.';
}
function saleTone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

export function RepresentativeDashboardPage() {
    const [data, setData] = useState(empty);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setData(await reportingApi.salesDashboard());
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        let active = true;
        void reportingApi
            .salesDashboard()
            .then((response) => {
                if (active) setData(response);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);
    const kpi = data.kpis;
    return (
        <div className="sales-dashboard">
            <header className="sales-page-heading">
                <div>
                    <p>{data.as_of ? dateTime(data.as_of) : 'Today'}</p>
                    <h1>Route overview</h1>
                </div>
                <StatusBadge tone="success">{data.representative.code || 'Active route'}</StatusBadge>
            </header>
            <section aria-label="Today's summary" className="sales-summary-grid representative-dashboard-kpis">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="cash" size={18} />
                    </span>
                    <small>Cash hold</small>
                    <strong>{money(kpi.cash_hold)}</strong>
                    <p>MMK currently in custody</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="sales" size={18} />
                    </span>
                    <small>Today's sales</small>
                    <strong>{money(kpi.today_sales)}</strong>
                    <p>
                        {money(kpi.today_cash_sales)} cash · {money(kpi.today_credit_sales)} credit
                    </p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="box" size={18} />
                    </span>
                    <small>Current stock</small>
                    <strong>{money(kpi.stock_units)}</strong>
                    <p>{kpi.stock_products} products on hand</p>
                </article>
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            <Link className="sales-primary-action" to="/sales/new-sale">
                <span>
                    <Icon name="plus" size={21} />
                </span>
                <div>
                    <strong>Create new sale</strong>
                    <small>Cash or customer credit</small>
                </div>
                <Icon name="chevronRight" />
            </Link>
            <section className="sales-section sales-dashboard-history">
                <header>
                    <div>
                        <p className="ui-eyebrow">Own transactions</p>
                        <h2>Recent sales</h2>
                    </div>
                    <Link to="/sales/sales-history">View sales history</Link>
                </header>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading salesâ€¦
                    </div>
                ) : data.recent_sales.length === 0 ? (
                    <EmptyState description="Drafts and posted sales will appear here." title="No recent sales" />
                ) : (
                    <div className="sales-dashboard-history-list">
                        {data.recent_sales.map((sale) => (
                            <article key={sale.id}>
                                <Link className="sales-history__identity" to={`/sales/sales-history/${sale.id}`}>
                                    <span>
                                        <Icon name={sale.payment_type === 'cash' ? 'cash' : 'customers'} size={16} />
                                    </span>
                                    <div>
                                        <strong>{sale.reference}</strong>
                                        <small>
                                            {sale.customer.name} Â· {dateTime(sale.created_at)}
                                        </small>
                                    </div>
                                </Link>
                                <div className="sales-history__amount">
                                    <strong>{money(sale.total_amount)} MMK</strong>
                                    <small>
                                        {sale.total_quantity} units Â· {sale.payment_type}
                                    </small>
                                </div>
                                <StatusBadge tone={saleTone(sale.status)}>{sale.status}</StatusBadge>
                            </article>
                        ))}
                    </div>
                )}
            </section>
            <div className="representative-dashboard-grid">
                <section className="sales-section">
                    <header>
                        <div>
                            <p className="ui-eyebrow">Inventory custody</p>
                            <h2>My stock</h2>
                        </div>
                        <Link to="/sales/my-stock">View all</Link>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading stock…
                        </div>
                    ) : data.stock.length === 0 ? (
                        <EmptyState description="Received products will appear here." title="No stock on hand" />
                    ) : (
                        <div className="sales-stock-list">
                            {data.stock.map((row) => (
                                <article key={row.id}>
                                    <span className="sales-stock-list__icon">
                                        <Icon name="box" size={17} />
                                    </span>
                                    <div>
                                        <strong>{row.product.name}</strong>
                                        <small>{row.product.sku}</small>
                                    </div>
                                    <span className="sales-stock-list__quantity">
                                        <strong>{row.quantity}</strong>
                                        <small>{row.product.unit}</small>
                                    </span>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
                <section className="sales-section sales-pending">
                    <header>
                        <div>
                            <p className="ui-eyebrow">Receiving</p>
                            <h2>Pending stock</h2>
                        </div>
                        <StatusBadge tone={kpi.pending_receivings ? 'warning' : 'success'}>
                            {kpi.pending_receivings} pending
                        </StatusBadge>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading receiving…
                        </div>
                    ) : data.pending_receivings.length === 0 ? (
                        <EmptyState
                            description="Dispatched stock will appear for confirmation."
                            title="Nothing waiting"
                        />
                    ) : (
                        data.pending_receivings.map((row) => (
                            <article className="representative-pending-notification" key={row.id}>
                                <span className="sales-stock-list__icon">
                                    <Icon name="truck" size={17} />
                                </span>
                                <div>
                                    <strong>{row.reference}</strong>
                                    <small>
                                        {row.warehouse.name} · {row.products} products · {row.total_quantity} units
                                    </small>
                                </div>
                                <div className="representative-pending-items">
                                    {(row.items ?? []).map((item) => (
                                        <div key={item.id}>
                                            <span>
                                                <strong>{item.product.name}</strong>
                                                <small>
                                                    {item.product.sku} · {item.product.unit}
                                                </small>
                                            </span>
                                            <b>+{item.quantity}</b>
                                        </div>
                                    ))}
                                </div>
                                <Link className="representative-pending-action" to={`/sales/receivings/${row.id}`}>
                                    <span>Open receiving</span>
                                    <Icon name="chevronRight" size={15} />
                                </Link>
                            </article>
                        ))
                    )}
                </section>
            </div>
            <Link className="sales-report-cta" to="/sales/reports">
                <Icon name="reports" size={18} />
                <div>
                    <strong>Sales report</strong>
                    <small>Filter your own sales by date, customer, product, and payment type.</small>
                </div>
                <Icon name="chevronRight" />
            </Link>
        </div>
    );
}
