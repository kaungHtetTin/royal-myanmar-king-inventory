import { useCallback, useEffect, useState } from 'react';
import { transferApi, type RepresentativeInventory, type RepresentativeTransfer } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, StatusBadge } from '../../ui/primitives';

function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load stock.';
}
function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}

export function RepresentativeStockPage() {
    const [stock, setStock] = useState<RepresentativeInventory[]>([]);
    const [pending, setPending] = useState<RepresentativeTransfer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [receiving, setReceiving] = useState<number | null>(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [inventory, receivings] = await Promise.all([transferApi.ownStock(), transferApi.ownReceivings()]);
            setStock(inventory.data);
            setPending(receivings.data);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        let active = true;
        void Promise.all([transferApi.ownStock(), transferApi.ownReceivings()])
            .then(([inventory, receivings]) => {
                if (!active) return;
                setStock(inventory.data);
                setPending(receivings.data);
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
    const receive = async (transfer: RepresentativeTransfer) => {
        if (
            !window.confirm(
                `Confirm all ${transfer.total_quantity} units received for ${transfer.reference}? Quantities cannot be edited.`,
            )
        )
            return;
        setReceiving(transfer.id);
        setError('');
        try {
            await transferApi.receiveOwn(transfer.id);
            await load();
            setNotice(`${transfer.reference} added to your stock.`);
            window.setTimeout(() => setNotice(''), 4000);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setReceiving(null);
        }
    };
    const onHand = stock.reduce((sum, row) => sum + row.quantity, 0);
    const incoming = stock.reduce((sum, row) => sum + row.pending_quantity, 0);

    return (
        <div className="sales-stock-page">
            <header className="sales-page-heading">
                <div>
                    <p>Inventory custody</p>
                    <h1>My stock</h1>
                </div>
                <StatusBadge tone={pending.length ? 'warning' : 'success'}>
                    {pending.length ? `${pending.length} pending` : 'Up to date'}
                </StatusBadge>
            </header>
            <section className="sales-summary-grid" aria-label="Stock summary">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="box" size={18} />
                    </span>
                    <small>On hand</small>
                    <strong>{number(onHand)}</strong>
                    <p>Units available for sales</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="truck" size={18} />
                    </span>
                    <small>Incoming</small>
                    <strong>{number(incoming)}</strong>
                    <p>Units awaiting confirmation</p>
                </article>
            </section>
            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="box" size={15} />
                    {notice}
                </div>
            ) : null}
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
                    <StatusBadge tone="warning">{pending.length} transfers</StatusBadge>
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
                    pending.map((transfer) => (
                        <article key={transfer.id}>
                            <div className="sales-receiving__heading">
                                <span className="sales-stock-list__icon">
                                    <Icon name="truck" size={17} />
                                </span>
                                <div>
                                    <strong>{transfer.reference}</strong>
                                    <small>
                                        {transfer.source_warehouse.name} · {transfer.total_quantity} units
                                    </small>
                                </div>
                                <StatusBadge tone="info">In transit</StatusBadge>
                            </div>
                            <div className="sales-receiving__items">
                                {transfer.items.map((item) => (
                                    <span key={item.product.id}>
                                        <strong>{item.product.name}</strong>
                                        <small>{item.product.sku}</small>
                                        <b>{item.quantity}</b>
                                    </span>
                                ))}
                            </div>
                            <Button
                                disabled={receiving === transfer.id}
                                onClick={() => void receive(transfer)}
                                requiresOnline
                                tone="primary"
                            >
                                {receiving === transfer.id ? 'Receiving…' : 'Confirm all received'}
                            </Button>
                        </article>
                    ))
                )}
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
            </section>
        </div>
    );
}
