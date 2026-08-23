import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { transferApi, type RepresentativeInventory, type RepresentativeTransfer } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { EmptyState, Pagination, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 10,
    to: null,
    total: 0,
};

function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load stock.';
}
function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}

export function RepresentativeStockPage() {
    const [stock, setStock] = useState<RepresentativeInventory[]>([]);
    const [pending, setPending] = useState<RepresentativeTransfer[]>([]);
    const [stockMeta, setStockMeta] = useState(emptyMeta);
    const [pendingMeta, setPendingMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState({ incoming: 0, on_hand: 0 });
    const [stockPage, setStockPage] = useState(1);
    const [receivingPage, setReceivingPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [inventory, receivings] = await Promise.all([
                transferApi.ownStock(stockPage),
                transferApi.ownReceivings(receivingPage),
            ]);
            setStock(inventory.data);
            setPending(receivings.data);
            setStockMeta(inventory.meta);
            setPendingMeta(receivings.meta);
            setSummary(inventory.summary);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [receivingPage, stockPage]);
    useEffect(() => {
        let active = true;
        void Promise.all([transferApi.ownStock(stockPage), transferApi.ownReceivings(receivingPage)])
            .then(([inventory, receivings]) => {
                if (!active) return;
                setStock(inventory.data);
                setPending(receivings.data);
                setStockMeta(inventory.meta);
                setPendingMeta(receivings.meta);
                setSummary(inventory.summary);
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
    }, [receivingPage, stockPage]);
    return (
        <div className="sales-stock-page">
            <header className="sales-page-heading">
                <div>
                    <p>Inventory custody</p>
                    <h1>My stock</h1>
                </div>
                <StatusBadge tone={pendingMeta.total ? 'warning' : 'success'}>
                    {pendingMeta.total ? `${pendingMeta.total} pending` : 'Up to date'}
                </StatusBadge>
            </header>
            <section className="sales-summary-grid" aria-label="Stock summary">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="box" size={18} />
                    </span>
                    <small>On hand</small>
                    <strong>{number(summary.on_hand)}</strong>
                    <p>Units available for sales</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="truck" size={18} />
                    </span>
                    <small>Incoming</small>
                    <strong>{number(summary.incoming)}</strong>
                    <p>Units awaiting confirmation</p>
                </article>
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            <section className="sales-section sales-receiving-list">
                <header>
                    <div>
                        <p className="ui-eyebrow">Receiving</p>
                        <h2>Pending stock</h2>
                    </div>
                    <div className="sales-section-header-actions">
                        <StatusBadge tone="warning">{pendingMeta.total} transfers</StatusBadge>
                        <Link to="/sales/stock-issue-history">View history</Link>
                    </div>
                </header>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading receiving list…
                    </div>
                ) : pending.length === 0 ? (
                    <EmptyState
                        description="Dispatched stock will appear here for your confirmation."
                        title="No stock waiting"
                    />
                ) : (
                    <div className="sales-receiving-notifications">
                        {pending.map((transfer) => (
                            <Link
                                aria-label={`View receiving details for ${transfer.reference}`}
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
                                        {transfer.items.length} products · {number(transfer.total_quantity)} units
                                    </span>
                                </div>
                                <StatusBadge tone="info">In transit</StatusBadge>
                                <span className="sales-receiving-notification__chevron" aria-hidden="true">
                                    <Icon name="chevronRight" size={16} />
                                </span>
                            </Link>
                        ))}
                    </div>
                )}
                <Pagination
                    label="Pending stock"
                    loading={loading}
                    meta={pendingMeta}
                    onPageChange={setReceivingPage}
                />
            </section>
            <section className="sales-section sales-available-stock-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">Available inventory</p>
                        <h2>Available products</h2>
                    </div>
                    <small>Read only · maximum 100 units per product</small>
                </header>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading stock…
                    </div>
                ) : stock.length === 0 ? (
                    <EmptyState description="Received products will be listed here." title="No stock on hand" />
                ) : (
                    <div className="sales-stock-list sales-available-stock-list">
                        {stock.map((row) => (
                            <article key={row.id}>
                                <span className="sales-stock-list__icon">
                                    <Icon name="box" size={17} />
                                </span>
                                <div className="sales-available-stock__identity">
                                    <strong>{row.product.name}</strong>
                                    <small>{row.product.sku}</small>
                                    {row.pending_quantity > 0 ? (
                                        <span className="sales-available-stock__incoming">
                                            <Icon name="truck" size={12} />
                                            {number(row.pending_quantity)} incoming
                                        </span>
                                    ) : null}
                                </div>
                                <div className="sales-available-stock__metrics">
                                    <span className="sales-stock-list__quantity">
                                        <small>On hand</small>
                                        <strong>{number(row.quantity)}</strong>
                                        <small>{row.product.unit}</small>
                                    </span>
                                    <span className="sales-capacity">
                                        <small>Capacity left</small>
                                        <strong>{number(row.capacity_remaining)}</strong>
                                        <span
                                            aria-label={`${number(row.capacity_remaining)} units of capacity remaining`}
                                            className="sales-capacity__bar"
                                            role="img"
                                        >
                                            <span
                                                style={{
                                                    width: `${Math.max(0, Math.min(100, row.capacity_remaining))}%`,
                                                }}
                                            />
                                        </span>
                                    </span>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <Pagination label="Available products" loading={loading} meta={stockMeta} onPageChange={setStockPage} />
            </section>
        </div>
    );
}
