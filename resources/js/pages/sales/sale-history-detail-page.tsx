import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { saleApi, type Sale, type SaleStatus } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, StatusBadge } from '../../ui/primitives';

function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
}

function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
}

function statusTone(status: SaleStatus) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

function requestMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load the sale detail.';
}

export function SaleHistoryDetailPage() {
    const { saleId } = useParams();
    const id = Number(saleId);
    const [sale, setSale] = useState<Sale | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError('This sale reference is invalid.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await saleApi.ownSale(id);
            setSale(response.data);
        } catch (requestError) {
            setError(requestMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        let active = true;
        const operation =
            Number.isInteger(id) && id > 0
                ? saleApi.ownSale(id)
                : Promise.reject(new Error('This sale reference is invalid.'));
        void operation
            .then((response) => {
                if (active) setSale(response.data);
            })
            .catch((requestError) => {
                if (active) setError(requestMessage(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id]);

    return (
        <div className="sales-sale-detail-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/sales/sales-history">
                        <Icon name="chevronLeft" size={16} />
                        Sales history
                    </Link>
                    <h1>{sale?.reference ?? 'Sale detail'}</h1>
                    <p>{sale ? `${sale.customer.name} · ${dateTime(sale.created_at)}` : 'Customer sale record'}</p>
                </div>
                {sale ? (
                    <div className="sale-detail-heading__actions">
                        <StatusBadge tone={statusTone(sale.status)}>{sale.status}</StatusBadge>
                        {sale.status === 'draft' ? (
                            <Link className="ui-button ui-button--primary" to={`/sales/new-sale?edit=${sale.id}`}>
                                <Icon name="edit" size={16} />
                                <span>Edit draft</span>
                            </Link>
                        ) : null}
                    </div>
                ) : null}
            </header>

            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <Button onClick={() => void load()} tone="ghost">
                        Retry
                    </Button>
                </div>
            ) : null}

            {loading ? (
                <div className="sales-section ui-loading" role="status">
                    <span />
                    Loading sale detail…
                </div>
            ) : sale ? (
                <>
                    <section className="sales-section sale-detail-overview">
                        <header>
                            <div>
                                <p className="ui-eyebrow">Transaction</p>
                                <h2>Sale information</h2>
                            </div>
                        </header>
                        <dl className="sale-detail-facts">
                            <div>
                                <dt>Customer</dt>
                                <dd>
                                    <strong>{sale.customer.name}</strong>
                                    <small>{sale.customer.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>Payment type</dt>
                                <dd>{sale.payment_type}</dd>
                            </div>
                            <div>
                                <dt>Warehouse</dt>
                                <dd>
                                    <strong>{sale.warehouse.name}</strong>
                                    <small>{sale.warehouse.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>Created</dt>
                                <dd>{dateTime(sale.created_at)}</dd>
                            </div>
                            <div>
                                <dt>Posted</dt>
                                <dd>{dateTime(sale.posted_at)}</dd>
                            </div>
                            <div>
                                <dt>Voided</dt>
                                <dd>{dateTime(sale.voided_at)}</dd>
                            </div>
                            <div className="sale-detail-facts__notes">
                                <dt>Notes</dt>
                                <dd>{sale.notes || 'No notes'}</dd>
                            </div>
                            {sale.void_reason ? (
                                <div className="sale-detail-facts__notes is-danger">
                                    <dt>Void reason</dt>
                                    <dd>{sale.void_reason}</dd>
                                </div>
                            ) : null}
                        </dl>
                    </section>

                    <section className="sales-section sale-detail-items">
                        <header>
                            <div>
                                <p className="ui-eyebrow">Products sold</p>
                                <h2>Line items</h2>
                            </div>
                            <small>{sale.total_quantity} units</small>
                        </header>
                        <div className="sale-detail-items__list">
                            {sale.items.map((item) => (
                                <article key={item.id}>
                                    <span className="sale-detail-items__icon">
                                        <Icon name="box" size={17} />
                                    </span>
                                    <div className="sale-detail-items__identity">
                                        <strong>{item.product.name}</strong>
                                        <small>
                                            {item.product.sku} · {item.product.unit}
                                        </small>
                                    </div>
                                    <div className="sale-detail-items__metric">
                                        <small>Quantity</small>
                                        <strong>{item.quantity}</strong>
                                    </div>
                                    <div className="sale-detail-items__metric">
                                        <small>Unit price</small>
                                        <strong>{money(item.unit_price)}</strong>
                                    </div>
                                    <div className="sale-detail-items__metric is-total">
                                        <small>Line total</small>
                                        <strong>{money(item.line_total)}</strong>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <footer className="sale-detail-total">
                            <span>
                                {sale.items.length} products · {sale.total_quantity} units
                            </span>
                            <div>
                                <small>Sale total</small>
                                <strong>{money(sale.total_amount)}</strong>
                            </div>
                        </footer>
                    </section>
                </>
            ) : null}
        </div>
    );
}
