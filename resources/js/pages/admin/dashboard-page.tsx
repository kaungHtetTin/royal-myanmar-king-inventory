import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportingApi, type AdminDashboard } from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

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
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function AdminDashboardPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
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
                setError(message(requestError, t('Unable to load dashboard.')));
            } finally {
                setLoading(false);
            }
        },
        [t, warehouseId],
    );
    useEffect(() => {
        let active = true;
        void reportingApi
            .adminDashboard()
            .then((response) => {
                if (active) setData(response);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load dashboard.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [t]);
    const selectWarehouse = (value: number) => {
        setWarehouseId(value);
        void load(value);
    };
    const kpi = data.kpis;
    return (
        <div className="admin-page dashboard-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{data.as_of ? formatDateTime(data.as_of) : t('Live operations')}</p>
                    <h1>{t('Operations overview')}</h1>
                    <p>
                        {t(
                            'Posted sales, current custody balances, and work awaiting confirmation across accessible warehouses.',
                        )}
                    </p>
                </div>
                <label className="dashboard-warehouse-filter">
                    <span>{t('Warehouse scope')}</span>
                    <select
                        aria-label={t('Warehouse scope')}
                        onChange={(event) => selectWarehouse(Number(event.target.value))}
                        value={warehouseId}
                    >
                        <option value={0}>{t('All accessible warehouses')}</option>
                        {data.warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.code} · {warehouse.name}
                            </option>
                        ))}
                    </select>
                </label>
            </header>
            <section aria-label={t('Key performance indicators')} className="metric-grid dashboard-kpis">
                <MetricCard
                    hint={t('{cash} cash · {credit} credit', {
                        cash: formatNumber(kpi.today_cash_sales),
                        credit: formatNumber(kpi.today_credit_sales),
                    })}
                    icon="sales"
                    label={t("Today's posted sales")}
                    value={money(kpi.today_sales)}
                />
                <MetricCard
                    hint={t('{count} active products', { count: formatNumber(kpi.products) })}
                    icon="warehouse"
                    label={t('Warehouse stock')}
                    value={formatNumber(kpi.warehouse_stock)}
                />
                <MetricCard
                    hint={t('Current customer balances')}
                    icon="customers"
                    label={t('Outstanding credit')}
                    value={money(kpi.customer_outstanding)}
                />
                <MetricCard
                    hint={t('{count} active representatives', {
                        count: formatNumber(kpi.active_representatives),
                    })}
                    icon="cash"
                    label={t('Representative cash')}
                    value={money(kpi.representative_cash)}
                />
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            <div className="dashboard-grid">
                <Panel
                    actions={
                        <Link className="ui-text-link" to="/admin/reports">
                            {t('Open reports')}
                        </Link>
                    }
                    eyebrow={t('Live custody ledger')}
                    title={t('Recent stock movements')}
                >
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            {t('Loading operations…')}
                        </div>
                    ) : data.recent_movements.length === 0 ? (
                        <EmptyState
                            description={t('Posted inventory activity for the selected scope will appear here.')}
                            title={t('No recent movements')}
                        />
                    ) : (
                        <div className="ui-table-wrap">
                            <table
                                aria-label={t('Recent stock movements')}
                                className="ui-table dashboard-stock-movements-table"
                            >
                                <thead>
                                    <tr>
                                        <th>{t('Reference')}</th>
                                        <th>{t('Product')}</th>
                                        <th>{t('Movement')}</th>
                                        <th className="is-numeric">{t('Qty')}</th>
                                        <th>{t('Actor / time')}</th>
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
                                                <strong>{formatNumber(movement.quantity)}</strong>
                                            </td>
                                            <td>
                                                {movement.actor.name}
                                                <small>{formatDateTime(movement.occurred_at)}</small>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Panel>
                <div className="dashboard-side-stack">
                    <Panel eyebrow={t('Attention')} title={t('Awaiting action')}>
                        <ul className="attention-list">
                            <li>
                                <span className="attention-icon is-warning">{kpi.pending_warehouse_transfers}</span>
                                <div>
                                    <strong>{t('Warehouse transfers')}</strong>
                                    <small>{t('Dispatched, awaiting receipt')}</small>
                                </div>
                                <Link aria-label={t('Review pending warehouse transfers')} to="/admin/transfers">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                            <li>
                                <span className="attention-icon is-info">{kpi.pending_representative_receivings}</span>
                                <div>
                                    <strong>{t('Representative receiving')}</strong>
                                    <small>{t('Stock remains in transit')}</small>
                                </div>
                                <Link aria-label={t('Review pending representative receiving')} to="/admin/transfers">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                            <li>
                                <span className="attention-icon is-danger">{kpi.pending_cash_submissions}</span>
                                <div>
                                    <strong>{t('Cash submissions')}</strong>
                                    <small>{t('Waiting for office confirmation')}</small>
                                </div>
                                <Link aria-label={t('Review pending cash submissions')} to="/admin/cash">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                            <li>
                                <span className="attention-icon is-warning">{kpi.low_stock_products ?? 0}</span>
                                <div>
                                    <strong>{t('Low-stock products')}</strong>
                                    <small>
                                        {t('At or below {count} warehouse units', {
                                            count: formatNumber(kpi.low_stock_threshold ?? 10),
                                        })}
                                    </small>
                                </div>
                                <Link aria-label={t('Review low-stock products')} to="/admin/inventory">
                                    <Icon name="chevronRight" />
                                </Link>
                            </li>
                        </ul>
                    </Panel>
                    <Panel className="dashboard-sales-composition" eyebrow={t('Sales composition')} title={t('Today')}>
                        <div className="dashboard-sales-split">
                            <div>
                                <span>{t('Cash')}</span>
                                <strong>{money(kpi.today_cash_sales)}</strong>
                            </div>
                            <div>
                                <span>{t('Credit')}</span>
                                <strong>{money(kpi.today_credit_sales)}</strong>
                            </div>
                        </div>
                        <Link className="dashboard-report-link" to="/admin/reports">
                            {t('Review reconciled reports')} <Icon name="chevronRight" size={15} />
                        </Link>
                    </Panel>
                </div>
            </div>
        </div>
    );
}
