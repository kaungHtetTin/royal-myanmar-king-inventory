import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { transferApi, type RepresentativeInventory, type RepresentativeTransfer } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { EmptyState, Pagination, StatusBadge } from '../../ui/primitives';
import { formatSellingUnitEquivalent } from '../../ui/selling-unit-equivalent';
import { useLocale } from '../../localization/locale-context';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 10,
    to: null,
    total: 0,
};

function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function RepresentativeStockPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const [searchParams] = useSearchParams();
    const historyView = searchParams.get('tab') === 'history';
    const [stock, setStock] = useState<RepresentativeInventory[]>([]);
    const [pending, setPending] = useState<RepresentativeTransfer[]>([]);
    const [history, setHistory] = useState<RepresentativeTransfer[]>([]);
    const [stockMeta, setStockMeta] = useState(emptyMeta);
    const [pendingMeta, setPendingMeta] = useState(emptyMeta);
    const [historyMeta, setHistoryMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState({ incoming: 0, on_hand: 0 });
    const [stockPage, setStockPage] = useState(1);
    const [stockSearch, setStockSearch] = useState('');
    const [stockSearchDraft, setStockSearchDraft] = useState('');
    const [receivingPage, setReceivingPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [inventory, receivings, receivedHistory] = await Promise.all([
                transferApi.ownStock(stockPage, stockSearch),
                transferApi.ownReceivings(receivingPage),
                transferApi.ownReceivingHistory(historyPage),
            ]);
            setStock(inventory.data);
            setPending(receivings.data);
            setStockMeta(inventory.meta);
            setPendingMeta(receivings.meta);
            setHistory(receivedHistory.data);
            setHistoryMeta(receivedHistory.meta);
            setSummary(inventory.summary);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load stock.')));
        } finally {
            setLoading(false);
        }
    }, [historyPage, receivingPage, stockPage, stockSearch, t]);
    useEffect(() => {
        let active = true;
        void Promise.all([
            transferApi.ownStock(stockPage, stockSearch),
            transferApi.ownReceivings(receivingPage),
            transferApi.ownReceivingHistory(historyPage),
        ])
            .then(([inventory, receivings, receivedHistory]) => {
                if (!active) return;
                setStock(inventory.data);
                setPending(receivings.data);
                setStockMeta(inventory.meta);
                setPendingMeta(receivings.meta);
                setHistory(receivedHistory.data);
                setHistoryMeta(receivedHistory.meta);
                setSummary(inventory.summary);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load stock.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [historyPage, receivingPage, stockPage, stockSearch, t]);
    return (
        <div className="sales-stock-page">
            <header className="sales-page-heading">
                <div>
                    <p>{t('Inventory custody')}</p>
                    <h1>{t('My stock')}</h1>
                </div>
                <StatusBadge tone={pendingMeta.total ? 'warning' : 'success'}>
                    {pendingMeta.total
                        ? t('{count} pending', { count: formatNumber(pendingMeta.total) })
                        : t('Up to date')}
                </StatusBadge>
            </header>
            <section className="sales-summary-grid" aria-label={t('Stock summary')}>
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="box" size={18} />
                    </span>
                    <small>{t('On hand')}</small>
                    <strong>{formatNumber(summary.on_hand)}</strong>
                    <p>{t('Units available for sales')}</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="truck" size={18} />
                    </span>
                    <small>{t('Incoming')}</small>
                    <strong>{formatNumber(summary.incoming)}</strong>
                    <p>{t('Units awaiting confirmation')}</p>
                </article>
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            <nav className="section-tabs sales-stock-tabs" aria-label={t('Stock sections')}>
                <Link
                    aria-current={!historyView ? 'page' : undefined}
                    className={!historyView ? 'is-active' : ''}
                    to="/sales/my-stock"
                >
                    <Icon name="box" size={15} />
                    {t('Current stock')}
                </Link>
                <Link
                    aria-current={historyView ? 'page' : undefined}
                    className={historyView ? 'is-active' : ''}
                    to="/sales/my-stock?tab=history"
                >
                    <Icon name="reports" size={15} />
                    {t('Issue history')}
                    <span className="section-tab-count">{formatNumber(historyMeta.total)}</span>
                </Link>
            </nav>
            {!historyView ? (
                <>
                    <section className="sales-section sales-receiving-list">
                        <header>
                            <div>
                                <p className="ui-eyebrow">{t('Receiving')}</p>
                                <h2>{t('Pending stock')}</h2>
                            </div>
                            <div className="sales-section-header-actions">
                                <StatusBadge tone="warning">
                                    {t('{count} transfers', { count: formatNumber(pendingMeta.total) })}
                                </StatusBadge>
                                <Link to="/sales/my-stock?tab=history">{t('View history')}</Link>
                            </div>
                        </header>
                        {loading ? (
                            <div className="ui-loading">
                                <span />
                                {t('Loading receiving list…')}
                            </div>
                        ) : pending.length === 0 ? (
                            <EmptyState
                                description={t('Dispatched stock will appear here for your confirmation.')}
                                title={t('No stock waiting')}
                            />
                        ) : (
                            <div className="sales-receiving-notifications">
                                {pending.map((transfer) => (
                                    <Link
                                        aria-label={t('View receiving details for {reference}', {
                                            reference: transfer.reference,
                                        })}
                                        className="sales-receiving-notification"
                                        key={transfer.id}
                                        to={`/sales/receivings/${transfer.id}`}
                                    >
                                        <span className="sales-stock-list__icon">
                                            <Icon name="truck" size={17} />
                                        </span>
                                        <div className="sales-receiving-notification__copy">
                                            <strong>{transfer.reference}</strong>
                                            <small>{transfer.source_warehouse.name}</small>
                                            <span>
                                                {t('{products} products · {quantity} units', {
                                                    products: formatNumber(transfer.items.length),
                                                    quantity: formatNumber(transfer.total_quantity),
                                                })}
                                            </span>
                                        </div>
                                        <StatusBadge tone="info">{t('In transit')}</StatusBadge>
                                        <span className="sales-receiving-notification__chevron" aria-hidden="true">
                                            <Icon name="chevronRight" size={16} />
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                        <Pagination
                            label={t('Pending stock')}
                            loading={loading}
                            meta={pendingMeta}
                            onPageChange={setReceivingPage}
                        />
                    </section>
                    <section className="sales-section sales-available-stock-section">
                        <header>
                            <div>
                                <p className="ui-eyebrow">{t('Available inventory')}</p>
                                <h2>{t('Available products')}</h2>
                            </div>
                            <small>{t('Read only · paid and FOC balances in base units')}</small>
                        </header>
                        <form
                            className="sales-stock-search"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setStockPage(1);
                                setStockSearch(stockSearchDraft.trim());
                            }}
                            role="search"
                        >
                            <label htmlFor="representative-stock-search">{t('Search available products')}</label>
                            <div>
                                <Icon name="search" size={16} />
                                <input
                                    id="representative-stock-search"
                                    onChange={(event) => setStockSearchDraft(event.target.value)}
                                    placeholder={t('Product name or SKU')}
                                    type="search"
                                    value={stockSearchDraft}
                                />
                            </div>
                            <button type="submit">{t('Search')}</button>
                        </form>
                        {loading ? (
                            <div className="ui-loading">
                                <span />
                                {t('Loading stock…')}
                            </div>
                        ) : stock.length === 0 ? (
                            <EmptyState
                                description={
                                    stockSearch
                                        ? t('Try another product name or SKU.')
                                        : t('Received products will be listed here.')
                                }
                                title={t(stockSearch ? 'No matching products' : 'No stock on hand')}
                            />
                        ) : (
                            <div className="sales-stock-table-wrap">
                                <table aria-label={t('Available product stock')} className="sales-stock-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">{t('Product')}</th>
                                            <th scope="col">{t('Paid quantity')}</th>
                                            <th scope="col">{t('FOC quantity')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stock.map((row) => (
                                            <tr key={row.id}>
                                                <td>
                                                    <strong>{row.product.name}</strong>
                                                    <small>{row.product.sku}</small>
                                                    {row.pending_quantity > 0 ? (
                                                        <span className="sales-available-stock__incoming">
                                                            <Icon name="truck" size={12} />
                                                            {t('{quantity} incoming', {
                                                                quantity: formatSellingUnitEquivalent(
                                                                    row.pending_quantity,
                                                                    row.product,
                                                                    formatNumber,
                                                                ),
                                                            })}
                                                        </span>
                                                    ) : null}
                                                </td>
                                                <td>
                                                    <strong>
                                                        {formatSellingUnitEquivalent(
                                                            row.quantity,
                                                            row.product,
                                                            formatNumber,
                                                        )}
                                                    </strong>
                                                </td>
                                                <td>
                                                    <strong>
                                                        {formatSellingUnitEquivalent(
                                                            row.foc_quantity,
                                                            row.product,
                                                            formatNumber,
                                                        )}
                                                    </strong>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <Pagination
                            label={t('Available products')}
                            loading={loading}
                            meta={stockMeta}
                            onPageChange={setStockPage}
                        />
                    </section>
                </>
            ) : (
                <section className="sales-section sales-receiving-list stock-issue-history-page">
                    <header>
                        <div>
                            <p className="ui-eyebrow">{t('Inventory custody')}</p>
                            <h2>{t('Completed stock issues')}</h2>
                        </div>
                        <small>{t('{count} records', { count: formatNumber(historyMeta.total) })}</small>
                    </header>
                    {loading ? (
                        <div className="ui-loading" role="status">
                            <span />
                            {t('Loading issue history…')}
                        </div>
                    ) : history.length === 0 ? (
                        <EmptyState
                            description={t('Received stock issues will appear here.')}
                            title={t('No issue history')}
                        />
                    ) : (
                        <div className="sales-receiving-notifications">
                            {history.map((transfer) => (
                                <Link
                                    aria-label={t('View stock issue {reference}', { reference: transfer.reference })}
                                    className="sales-receiving-notification"
                                    key={transfer.id}
                                    to={`/sales/receivings/${transfer.id}`}
                                >
                                    <span className="sales-stock-list__icon">
                                        <Icon name="box" size={17} />
                                    </span>
                                    <div className="sales-receiving-notification__copy">
                                        <strong>{transfer.reference}</strong>
                                        <small>{transfer.source_warehouse.name}</small>
                                        <span>
                                            {t('{products} products · {quantity} units · {date}', {
                                                products: formatNumber(transfer.items.length),
                                                quantity: formatNumber(transfer.total_quantity),
                                                date:
                                                    transfer.received_at || transfer.reversed_at
                                                        ? formatDateTime(
                                                              transfer.received_at ?? transfer.reversed_at ?? '',
                                                          )
                                                        : '—',
                                            })}
                                        </span>
                                    </div>
                                    <StatusBadge tone={transfer.status === 'received' ? 'success' : 'danger'}>
                                        {t(transfer.status)}
                                    </StatusBadge>
                                    <span className="sales-receiving-notification__chevron" aria-hidden="true">
                                        <Icon name="chevronRight" size={16} />
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                    <Pagination
                        label={t('Stock issue history')}
                        loading={loading}
                        meta={historyMeta}
                        onPageChange={setHistoryPage}
                    />
                </section>
            )}
        </div>
    );
}
