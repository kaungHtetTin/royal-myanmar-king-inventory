import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reportingApi, type SalesDashboard } from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { EmptyState, StatusBadge } from '../../ui/primitives';
import { formatSellingUnitEquivalent } from '../../ui/selling-unit-equivalent';
import { useLocale } from '../../localization/locale-context';

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
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
function saleTone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

export function RepresentativeDashboardPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => formatNumber(value);
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const [data, setData] = useState(empty);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setData(await reportingApi.salesDashboard());
        } catch (requestError) {
            setError(message(requestError, t('Unable to load dashboard.')));
        } finally {
            setLoading(false);
        }
    }, [t]);
    useEffect(() => {
        let active = true;
        void reportingApi
            .salesDashboard()
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
    const kpi = data.kpis;
    return (
        <div className="sales-dashboard">
            <header className="sales-page-heading">
                <div>
                    <p>{data.as_of ? dateTime(data.as_of) : t('Today')}</p>
                    <h1>{t('Route overview')}</h1>
                </div>
                <StatusBadge tone="success">{data.representative.code || t('Active route')}</StatusBadge>
            </header>
            <section aria-label={t("Today's summary")} className="sales-summary-grid representative-dashboard-kpis">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="cash" size={18} />
                    </span>
                    <small>{t('Cash hold')}</small>
                    <strong>{money(kpi.cash_hold)}</strong>
                    <p>{t('MMK currently in custody')}</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="sales" size={18} />
                    </span>
                    <small>{t("Today's sales")}</small>
                    <strong>{money(kpi.today_sales)}</strong>
                    <p>
                        {t('{cash} cash · {credit} credit', {
                            cash: money(kpi.today_cash_sales),
                            credit: money(kpi.today_credit_sales),
                        })}
                    </p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="box" size={18} />
                    </span>
                    <small>{t('Current stock')}</small>
                    <strong>{money(kpi.stock_units)}</strong>
                    <p>{t('{count} products on hand', { count: formatNumber(kpi.stock_products) })}</p>
                </article>
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            <Link className="sales-primary-action" to="/sales/new-sale">
                <span>
                    <Icon name="plus" size={21} />
                </span>
                <div>
                    <strong>{t('Create new sale')}</strong>
                    <small>{t('Cash or customer credit')}</small>
                </div>
                <Icon name="chevronRight" />
            </Link>
            <section className="sales-section sales-dashboard-history">
                <header>
                    <div>
                        <p className="ui-eyebrow">{t('Own transactions')}</p>
                        <h2>{t('Recent sales')}</h2>
                    </div>
                    <Link to="/sales/sales-history">{t('View sales history')}</Link>
                </header>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        {t('Loading sales…')}
                    </div>
                ) : data.recent_sales.length === 0 ? (
                    <EmptyState
                        description={t('Drafts and posted sales will appear here.')}
                        title={t('No recent sales')}
                    />
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
                                            {sale.customer.name} · {dateTime(sale.created_at)}
                                        </small>
                                    </div>
                                </Link>
                                <div className="sales-history__amount">
                                    <strong>{money(sale.total_amount)} MMK</strong>
                                    <small>
                                        {t('{count} units · {payment}', {
                                            count: formatNumber(sale.total_quantity),
                                            payment: t(sale.payment_type),
                                        })}
                                    </small>
                                </div>
                                <StatusBadge tone={saleTone(sale.status)}>{t(sale.status)}</StatusBadge>
                            </article>
                        ))}
                    </div>
                )}
            </section>
            <div className="representative-dashboard-grid">
                <section className="sales-section">
                    <header>
                        <div>
                            <p className="ui-eyebrow">{t('Inventory custody')}</p>
                            <h2>{t('My stock')}</h2>
                        </div>
                        <Link to="/sales/my-stock">{t('View all')}</Link>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            {t('Loading stock…')}
                        </div>
                    ) : data.stock.length === 0 ? (
                        <EmptyState
                            description={t('Received products will appear here.')}
                            title={t('No stock on hand')}
                        />
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
                                        <strong>
                                            {formatSellingUnitEquivalent(row.quantity, row.product, formatNumber)}
                                        </strong>
                                    </span>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
                <section className="sales-section sales-pending">
                    <header>
                        <div>
                            <p className="ui-eyebrow">{t('Receiving')}</p>
                            <h2>{t('Pending stock')}</h2>
                        </div>
                        <StatusBadge tone={kpi.pending_receivings ? 'warning' : 'success'}>
                            {t('{count} pending', { count: formatNumber(kpi.pending_receivings) })}
                        </StatusBadge>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            {t('Loading receiving…')}
                        </div>
                    ) : data.pending_receivings.length === 0 ? (
                        <EmptyState
                            description={t('Dispatched stock will appear for confirmation.')}
                            title={t('Nothing waiting')}
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
                                        {t('{warehouse} · {products} products · {quantity} units', {
                                            warehouse: row.warehouse.name,
                                            products: formatNumber(row.products),
                                            quantity: formatNumber(row.total_quantity),
                                        })}
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
                                            <b>
                                                +{formatNumber(item.quantity)} {item.unit?.name ?? item.product.unit}
                                            </b>
                                        </div>
                                    ))}
                                </div>
                                <Link className="representative-pending-action" to={`/sales/receivings/${row.id}`}>
                                    <span>{t('Open receiving')}</span>
                                    <Icon name="chevronRight" size={15} />
                                </Link>
                            </article>
                        ))
                    )}
                </section>
            </div>
            <Link className="sales-report-cta" to="/sales/sales-history">
                <Icon name="reports" size={18} />
                <div>
                    <strong>{t('Sales')}</strong>
                    <small>
                        {t('Review and filter your sales by trip, date, customer, product, and payment type.')}
                    </small>
                </div>
                <Icon name="chevronRight" />
            </Link>
        </div>
    );
}
