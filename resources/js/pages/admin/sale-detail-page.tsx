import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { useBranding } from '../../branding/branding-context';
import { printInvoice } from '../../services/invoice-print';
import { saleApi, type Sale, type SaleStatus } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, Dialog, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

const money = (value: number) => `${new Intl.NumberFormat('en-US').format(value)} MMK`;
const dateTime = (value: string | null) =>
    value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';
const message = (error: unknown) => (error instanceof Error ? error.message : 'Unable to load the sale record.');
const tone = (status: SaleStatus) => (status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'danger');

export function AdminSaleDetailPage() {
    const { saleId } = useParams();
    const { branding } = useBranding();
    const { user } = useSession();
    const id = Number(saleId);
    const canVoid = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('sale.void'));
    const [sale, setSale] = useState<Sale | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [voidOpen, setVoidOpen] = useState(false);
    const [reason, setReason] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError('Invalid sale reference.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            setSale((await saleApi.adminSale(id)).data);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [id]);
    useEffect(() => {
        let active = true;
        void saleApi
            .adminSale(id)
            .then((response) => {
                if (active) setSale(response.data);
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
    }, [id]);

    const voidSale = async () => {
        if (!sale || !reason.trim()) return;
        setWorking(true);
        setError('');
        try {
            const response = await saleApi.void(sale.id, reason.trim());
            setSale(response.data);
            setNotice(`${sale.reference} voided with compensating entries.`);
            setVoidOpen(false);
            setReason('');
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setWorking(false);
        }
    };
    if (loading && !sale)
        return (
            <div className="ui-loading" role="status">
                <span />
                Loading sale detail…
            </div>
        );
    if (!sale)
        return (
            <div className="admin-page admin-sale-detail-page">
                <Link className="sale-detail-back" to="/admin/sales">
                    <Icon name="chevronLeft" size={13} />
                    Sales
                </Link>
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error || 'Sale not found.'}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            </div>
        );

    return (
        <div className="admin-page admin-sale-detail-page">
            <header className="page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/sales">
                        <Icon name="chevronLeft" size={13} />
                        Representative sales
                    </Link>
                    <p className="ui-eyebrow">Sale transaction</p>
                    <h1>{sale.reference}</h1>
                    <p>
                        {sale.customer.name} · {sale.representative.name} · {dateTime(sale.created_at)}
                    </p>
                </div>
                <div className="sale-detail-heading__actions">
                    <StatusBadge tone={tone(sale.status)}>{sale.status}</StatusBadge>
                    {sale.status !== 'draft' ? (
                        <Button
                            icon="print"
                            onClick={() => {
                                if (!printInvoice(sale, branding)) setError('Allow pop-ups to print the invoice.');
                            }}
                        >
                            Print invoice
                        </Button>
                    ) : null}
                    {canVoid && sale.status === 'posted' ? (
                        <Button icon="reverse" onClick={() => setVoidOpen(true)} requiresOnline tone="danger">
                            Void sale
                        </Button>
                    ) : null}
                </div>
            </header>
            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="check" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()} type="button">
                        Retry
                    </button>
                </div>
            ) : null}
            <section aria-label="Sale summary" className="metric-grid admin-sale-detail-kpis">
                <MetricCard hint="Distinct products" icon="box" label="Products" value={String(sale.items.length)} />
                <MetricCard
                    hint={`${sale.total_foc_quantity ?? 0} FOC units supplied`}
                    icon="sales"
                    label="Sold quantity"
                    value={String(sale.total_quantity)}
                />
                <MetricCard
                    hint={sale.payment_type === 'cash' ? 'Cash transaction' : 'Customer credit'}
                    icon="cash"
                    label="Sale total"
                    value={money(sale.total_amount)}
                />
            </section>
            <div className="admin-sale-detail-grid">
                <Panel className="admin-sale-detail-items" eyebrow="Products sold" title="Line items">
                    <div className="ui-table-wrap">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Unit</th>
                                    <th className="is-numeric">Quantity</th>
                                    <th className="is-numeric">FOC</th>
                                    <th className="is-numeric">Unit price</th>
                                    <th className="is-numeric">Line total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sale.items.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <strong>{item.product.name}</strong>
                                            <small>{item.product.sku}</small>
                                        </td>
                                        <td>{item.unit?.name ?? item.product.unit}</td>
                                        <td className="is-numeric">{item.quantity}</td>
                                        <td className="is-numeric">
                                            {item.foc_quantity
                                                ? `${item.foc_quantity} ${item.foc_unit?.name ?? item.unit?.name ?? item.product.unit}`
                                                : '—'}
                                        </td>
                                        <td className="is-numeric">{money(item.unit_price)}</td>
                                        <td className="is-numeric">
                                            <strong>{money(item.line_total)}</strong>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={2}>Total</td>
                                    <td className="is-numeric">
                                        <strong>{sale.total_quantity}</strong>
                                    </td>
                                    <td className="is-numeric">
                                        <strong>{sale.total_foc_quantity ?? 0}</strong>
                                    </td>
                                    <td />
                                    <td className="is-numeric">
                                        <strong>{money(sale.total_amount)}</strong>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Panel>
                <Panel eyebrow="Transaction" title="Sale information">
                    <dl className="transfer-detail-facts">
                        <div>
                            <dt>Customer</dt>
                            <dd>
                                {sale.customer.name}
                                <small>{sale.customer.code}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Representative</dt>
                            <dd>
                                {sale.representative.name}
                                <small>{sale.representative.code}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Warehouse</dt>
                            <dd>
                                {sale.warehouse.name}
                                <small>{sale.warehouse.code}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Region / Way</dt>
                            <dd>
                                {sale.region?.name ?? '—'}
                                <small>{sale.way ? `${sale.way.name} · ${sale.way.code}` : 'Not assigned'}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Payment</dt>
                            <dd>{sale.payment_type}</dd>
                        </div>
                        <div>
                            <dt>Created by</dt>
                            <dd>
                                {sale.created_by?.name ?? sale.representative.name}
                                <small>{dateTime(sale.created_at)}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>Posted by</dt>
                            <dd>
                                {sale.posted_by?.name ?? 'Not posted'}
                                <small>{dateTime(sale.posted_at)}</small>
                            </dd>
                        </div>
                        <div className="is-wide">
                            <dt>Notes</dt>
                            <dd>{sale.notes || 'No notes recorded'}</dd>
                        </div>
                        {sale.void_reason ? (
                            <div className="is-wide is-danger">
                                <dt>Void reason</dt>
                                <dd>
                                    {sale.void_reason}
                                    <small>
                                        {sale.voided_by?.name} · {dateTime(sale.voided_at)}
                                    </small>
                                </dd>
                            </div>
                        ) : null}
                    </dl>
                </Panel>
            </div>
            <Dialog
                description="Voiding creates compensating stock and financial entries. The original sale remains in the audit trail."
                footer={
                    <>
                        <Button disabled={working} onClick={() => setVoidOpen(false)}>
                            Keep sale
                        </Button>
                        <Button
                            disabled={working || !reason.trim()}
                            onClick={() => void voidSale()}
                            requiresOnline
                            tone="danger"
                        >
                            {working ? 'Voiding…' : 'Void sale'}
                        </Button>
                    </>
                }
                onClose={() => setVoidOpen(false)}
                open={voidOpen}
                title={`Void ${sale.reference}?`}
                width="compact"
            >
                <label className="ui-field">
                    <span>Reason</span>
                    <textarea
                        autoFocus
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Explain why this sale must be reversed"
                        rows={4}
                        value={reason}
                    />
                </label>
            </Dialog>
        </div>
    );
}
