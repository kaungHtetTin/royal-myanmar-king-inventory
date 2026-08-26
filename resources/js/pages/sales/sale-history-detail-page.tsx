import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useBranding } from '../../branding/branding-context';
import { printInvoice } from '../../services/invoice-print';
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
    const { branding } = useBranding();
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
                        {sale.status !== 'draft' ? (
                            <Button
                                icon="print"
                                onClick={() => {
                                    if (!printInvoice(sale, branding)) {
                                        setError('Allow pop-ups to print the invoice.');
                                    }
                                }}
                            >
                                Print invoice
                            </Button>
                        ) : null}
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
                                <dt>Region / Way</dt>
                                <dd>
                                    <strong>{sale.region?.name ?? '—'}</strong>
                                    <small>{sale.way ? `${sale.way.name} · ${sale.way.code}` : 'Not assigned'}</small>
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
                            <small>
                                {sale.total_quantity} sold · {sale.total_foc_quantity ?? 0} FOC
                            </small>
                        </header>
                        <div className="ui-table-wrap sale-detail-items__table-wrap">
                            <table className="ui-table sale-detail-items__table">
                                <caption className="sr-only">Sale line items</caption>
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th>Unit</th>
                                        <th className="is-numeric">Paid qty</th>
                                        <th className="is-numeric">FOC</th>
                                        <th className="is-numeric">Unit price</th>
                                        <th className="is-numeric">Line total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sale.items.map((item) => (
                                        <tr key={item.id}>
                                            <td className="sale-detail-items__product">
                                                <strong>{item.product.name}</strong>
                                                <small>{item.product.sku}</small>
                                            </td>
                                            <td>{item.unit?.name ?? item.product.unit}</td>
                                            <td className="is-numeric">{item.quantity}</td>
                                            <td className="is-numeric">
                                                {item.foc_quantity ? (
                                                    <>
                                                        <strong>{item.foc_quantity}</strong>
                                                        <small>
                                                            {item.foc_unit?.name ??
                                                                item.unit?.name ??
                                                                item.product.unit}
                                                        </small>
                                                    </>
                                                ) : (
                                                    '—'
                                                )}
                                            </td>
                                            <td className="is-numeric">{money(item.unit_price)}</td>
                                            <td className="is-numeric sale-detail-items__line-total">
                                                {money(item.line_total)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <footer className="sale-detail-total">
                            <span>
                                {sale.items.length} products · {sale.total_quantity} sold ·{' '}
                                {sale.total_foc_quantity ?? 0} FOC
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
