import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportingApi, type AdminDashboard } from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

const empty: AdminDashboard = {
    as_of: '',
    warehouses: [],
    selected_warehouse_id: null,
    kpis: {
        warehouse_stock: 0,
        products: 0,
        active_representatives: 0,
        today_sales: 0,
        today_cash_sales: 0,
        today_credit_sales: 0,
        customer_outstanding: 0,
        representative_cash: 0,
        pending_warehouse_transfers: 0,
        pending_representative_receivings: 0,
        pending_cash_submissions: 0,
    },
    recent_movements: [],
};
function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
}
function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function dateTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load dashboard.';
}

export function AdminDashboardPage() {
    const [data, setData] = useState(empty);
    const [warehouseId, setWarehouseId] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(
        async (selected = warehouseId) => {
            setLoading(true);
            setError('');
            try {
                setData(await reportingApi.adminDashboard(selected || undefined));
            } catch (requestError) {
                setError(message(requestError));
            } finally {
                setLoading(false);
            }
        },
        [warehouseId],
    );
    useEffect(() => {
        let active = true;
        void reportingApi
            .adminDashboard()
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
    const selectWarehouse = (value: number) => {
        setWarehouseId(value);
        void load(value);
    };
    const kpi = data.kpis;
    return (
        <div className="admin-page dashboard-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{data.as_of ? dateTime(data.as_of) : 'Live operations'}</p>
                    <h1>Operations overview</h1>
                    <p>
                        Posted sales, current custody balances, and work awaiting confirmation across accessible
                        warehouses.
                    </p>
                </div>
                <label className="dashboard-warehouse-filter">
                    <span>Warehouse scope</span>
                    <select
                        aria-label="Warehouse scope"
                        onChange={(event) => selectWarehouse(Number(event.target.value))}
                        value={warehouseId}
                    >
                        <option value={0}>All accessible warehouses</option>
                        {data.warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.code} · {warehouse.name}
                            </option>
                        ))}
                    </select>
                </label>
            </header>
            <section aria-label="Key performance indicators" className="metric-grid dashboard-kpis">
                <MetricCard
                    hint={`${number(kpi.today_cash_sales)} cash · ${number(kpi.today_credit_sales)} credit`}
                    icon="sales"
                    label="Today's posted sales"
                    value={money(kpi.today_sales)}
                />
                <MetricCard
                    hint={`${kpi.products} active products`}
                    icon="warehouse"
                    label="Warehouse stock"
                    value={number(kpi.warehouse_stock)}
                />
                <MetricCard
                    hint="Current customer balances"
                    icon="customers"
                    label="Outstanding credit"
                    value={money(kpi.customer_outstanding)}
                />
                <MetricCard
                    hint={`${kpi.active_representatives} active representatives`}
                    icon="cash"
                    label="Representative cash"
                    value={money(kpi.representative_cash)}
                />
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            <div className="dashboard-grid">
                <Panel
                    actions={
                        <Link className="ui-text-link" to="/admin/reports">
                            Open reports
                        </Link>
                    }
                    eyebrow="Live custody ledger"
                    title="Recent stock movements"
                >
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading operations…
                        </div>
                    ) : data.recent_movements.length === 0 ? (
                        <EmptyState
                            description="Posted inventory activity for the selected scope will appear here."
                            title="No recent movements"
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>Reference</th>
                                        <th>Product</th>
                                        <th>Movement</th>
                                        <th className="is-numeric">Qty</th>
                                        <th>Actor / time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.recent_movements.map((movement) => (
                                        <tr key={movement.id}>
                                            <td>
                                                <strong>{movement.reference}</strong>
                                            </td>
                                            <td>
                                                <span className="table-primary">{movement.product.name}</span>
                                                <small>{movement.product.sku}</small>
                                            </td>
                                            <td>
                                                <StatusBadge
                                                    tone={
                                                        movement.type.includes('OUT') ||
                                                        movement.type.includes('DISPATCH')
                                                            ? 'warning'
                                                            : 'success'
                                                    }
                                                >
                                                    {movement.type.replaceAll('_', ' ')}
                                                </StatusBadge>
                                            </td>
                                            <td className="is-numeric">
                                                <strong>{number(movement.quantity)}</strong>
                                            </td>
                                            <td>
                                                {movement.actor.name}
                                                <small>{dateTime(movement.occurred_at)}</small>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
                <div className="dashboard-side-stack">
                    <Panel eyebrow="Attention" title="Awaiting action">
                        <ul className="attention-list">
                            <li>
                                <span className="attention-icon is-warning">{kpi.pending_warehouse_transfers}</span>
                                <div>
                                    <strong>Warehouse transfers</strong>
                                    <small>Dispatched, awaiting receipt</small>
                                </div>
                                <Link aria-label="Review pending warehouse transfers" to="/admin/transfers">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                            <li>
                                <span className="attention-icon is-info">{kpi.pending_representative_receivings}</span>
                                <div>
                                    <strong>Representative receiving</strong>
                                    <small>Stock remains in transit</small>
                                </div>
                                <Link aria-label="Review pending representative receiving" to="/admin/transfers">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                            <li>
                                <span className="attention-icon is-danger">{kpi.pending_cash_submissions}</span>
                                <div>
                                    <strong>Cash submissions</strong>
                                    <small>Waiting for office confirmation</small>
                                </div>
                                <Link aria-label="Review pending cash submissions" to="/admin/cash">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                        </ul>
                    </Panel>
                    <Panel className="dashboard-sales-composition" eyebrow="Sales composition" title="Today">
                        <div className="dashboard-sales-split">
                            <div>
                                <span>Cash</span>
                                <strong>{money(kpi.today_cash_sales)}</strong>
                            </div>
                            <div>
                                <span>Credit</span>
                                <strong>{money(kpi.today_credit_sales)}</strong>
                            </div>
                        </div>
                        <Link className="dashboard-report-link" to="/admin/reports">
                            Review reconciled reports <Icon name="chevronRight" size={15} />
                        </Link>
                    </Panel>
                </div>
            </div>
        </div>
    );
}
