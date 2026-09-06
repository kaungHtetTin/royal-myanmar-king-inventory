import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { saleApi, type Sale, type SaleStatus } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { InvoicePrintButton } from '../../ui/invoice-print-dialog';
import { Button, Dialog, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const tone = (status: SaleStatus) => (status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'danger');
const coordinates = (value: number) => value.toFixed(7);
const mapLinks = (latitude: number, longitude: number) => {
    const span = 0.005;
    const marker = `${latitude},${longitude}`;
    const box = `${longitude - span},${latitude - span},${longitude + span},${latitude + span}`;

    return {
        embed: `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(box)}&layer=mapnik&marker=${encodeURIComponent(marker)}`,
        open: `https://www.openstreetmap.org/?mlat=${encodeURIComponent(latitude)}&mlon=${encodeURIComponent(longitude)}#map=17/${latitude}/${longitude}`,
    };
};

export function AdminSaleDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const { saleId } = useParams();
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
            setError(t('Invalid sale reference.'));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            setSale((await saleApi.adminSale(id)).data);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load the sale record.')));
        } finally {
            setLoading(false);
        }
    }, [id, t]);
    useEffect(() => {
        let active = true;
        void saleApi
            .adminSale(id)
            .then((response) => {
                if (active) setSale(response.data);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load the sale record.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, t]);

    const voidSale = async () => {
        if (!sale || !reason.trim()) return;
        setWorking(true);
        setError('');
        try {
            const response = await saleApi.void(sale.id, reason.trim());
            setSale(response.data);
            setNotice(t('{reference} voided with compensating entries.', { reference: sale.reference }));
            setVoidOpen(false);
            setReason('');
        } catch (requestError) {
            setError(message(requestError, t('Unable to load the sale record.')));
        } finally {
            setWorking(false);
        }
    };
    if (loading && !sale)
        return (
            <div className="ui-loading" role="status">
                <span />
                {t('Loading sale detail…')}
            </div>
        );
    if (!sale)
        return (
            <div className="admin-page admin-sale-detail-page">
                <Link className="sale-detail-back" to="/admin/sales">
                    <Icon name="chevronLeft" size={13} />
                    {t('Sales')}
                </Link>
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error || t('Sale not found.')}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
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
                        {t('Representative sales')}
                    </Link>
                    <p className="ui-eyebrow">{t('Sale transaction')}</p>
                    <h1>{sale.reference}</h1>
                    <p>
                        {sale.customer.name} · {sale.representative.name} · {dateTime(sale.created_at)}
                    </p>
                </div>
                <div className="sale-detail-heading__actions">
                    <StatusBadge tone={tone(sale.status)}>{t(sale.status)}</StatusBadge>
                    {sale.status !== 'draft' ? (
                        <InvoicePrintButton
                            onBlocked={() => setError(t('Allow pop-ups to print the invoice.'))}
                            sale={sale}
                        />
                    ) : null}
                    {canVoid && sale.status === 'posted' ? (
                        <Button icon="reverse" onClick={() => setVoidOpen(true)} requiresOnline tone="danger">
                            {t('Void sale')}
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
                        {t('Retry')}
                    </button>
                </div>
            ) : null}
            <section aria-label={t('Sale summary')} className="metric-grid admin-sale-detail-kpis">
                <MetricCard
                    hint={t('Distinct products')}
                    icon="box"
                    label={t('Products')}
                    value={formatNumber(sale.items.length)}
                />
                <MetricCard
                    hint={t('{count} FOC units supplied', {
                        count: formatNumber(sale.total_foc_quantity ?? 0),
                    })}
                    icon="sales"
                    label={t('Sold quantity')}
                    value={formatNumber(sale.total_quantity)}
                />
                <MetricCard
                    hint={t(sale.payment_type === 'credit' ? 'Customer credit' : sale.adds_to_cash_hold ? 'Cash transaction' : 'Direct / banking payment')}
                    icon="cash"
                    label={t('Sale total')}
                    value={money(sale.total_amount)}
                />
            </section>
            <div className="admin-sale-detail-grid">
                <Panel className="admin-sale-detail-items" eyebrow={t('Products sold')} title={t('Line items')}>
                    <div className="ui-table-wrap">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>{t('Product')}</th>
                                    <th>{t('Unit')}</th>
                                    <th className="is-numeric">{t('Quantity')}</th>
                                    <th className="is-numeric">{t('FOC')}</th>
                                    <th className="is-numeric">{t('Unit price')}</th>
                                    <th className="is-numeric">{t('Discount')}</th>
                                    <th className="is-numeric">{t('Line total')}</th>
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
                                        <td className="is-numeric">{formatNumber(item.quantity)}</td>
                                        <td className="is-numeric">
                                            {item.foc_quantity
                                                ? `${formatNumber(item.foc_quantity)} ${item.foc_unit?.name ?? item.unit?.name ?? item.product.unit}`
                                                : '—'}
                                        </td>
                                        <td className="is-numeric">{money(item.unit_price)}</td>
                                        <td className="is-numeric">{(item.discount_percentage ?? 0) > 0 ? `${item.discount_percentage}% · ${money(item.discount_amount ?? 0)}` : '—'}{item.cashback_amount ? <small>{t('Cashback amount')}: -{money(item.cashback_amount)}</small> : null}{item.promotion_amount ? <small>{item.promotion_title || t('Promotion')}: -{money(item.promotion_amount)}</small> : null}</td>
                                        <td className="is-numeric">
                                            <strong>{money(item.line_total)}</strong>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={2}>{t('Total')}</td>
                                    <td className="is-numeric">
                                        <strong>{formatNumber(sale.total_quantity)}</strong>
                                    </td>
                                    <td className="is-numeric">
                                        <strong>{formatNumber(sale.total_foc_quantity ?? 0)}</strong>
                                    </td>
                                    <td />
                                    <td className="is-numeric"><strong>{money(sale.total_discount ?? 0)}</strong><small>{t('Cashback amount')}: {money(sale.total_cashback ?? 0)}</small><small>{t('Item promotions')}: {money(sale.total_item_promotion ?? 0)}</small></td>
                                    <td className="is-numeric">
                                        <strong>{money(sale.total_amount)}</strong>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Panel>
                <div className="admin-sale-detail-sidebar">
                    <Panel eyebrow={t('Transaction')} title={t('Sale information')}>
                        <dl className="transfer-detail-facts">
                            <div>
                                <dt>{t('Customer')}</dt>
                                <dd>
                                    {sale.customer.name}
                                    <small>{sale.customer.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Representative')}</dt>
                                <dd>
                                    {sale.representative.name}
                                    <small>{sale.representative.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Warehouse')}</dt>
                                <dd>
                                    {sale.warehouse.name}
                                    <small>{sale.warehouse.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Region')}</dt>
                                <dd>
                                    {sale.region?.name ?? '—'}
                                    <small>
                                    </small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Payment')}</dt>
                                <dd>{t(sale.payment_type)}{sale.payment_method ? ` · ${sale.payment_method_name ?? t(sale.payment_method)}` : ''}</dd>
                            </div>
                            <div>
                                <dt>{t('Promotion cashback')}</dt>
                                <dd>{sale.promotion_amount ? `-${money(sale.promotion_amount)}` : t('None')}<small>{sale.promotion_title ?? ''}</small></dd>
                            </div>
                            <div>
                                <dt>{t('Created by')}</dt>
                                <dd>
                                    {sale.created_by?.name ?? sale.representative.name}
                                    <small>{dateTime(sale.created_at)}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Posted by')}</dt>
                                <dd>
                                    {sale.posted_by?.name ?? t('Not posted')}
                                    <small>{dateTime(sale.posted_at)}</small>
                                </dd>
                            </div>
                            <div className="is-wide">
                                <dt>{t('Notes')}</dt>
                                <dd>{sale.notes || t('No notes recorded')}</dd>
                            </div>
                            {sale.void_reason ? (
                                <div className="is-wide is-danger">
                                    <dt>{t('Void reason')}</dt>
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
                    <Panel
                        className="admin-sale-location-panel"
                        eyebrow={t('Creation point')}
                        title={t('Sale location')}
                    >
                        {sale.creation_location ? (
                            <div className="sale-location-map">
                                <iframe
                                    loading="lazy"
                                    referrerPolicy="no-referrer"
                                    src={
                                        mapLinks(sale.creation_location.latitude, sale.creation_location.longitude)
                                            .embed
                                    }
                                    title={t('Map showing where {reference} was created', {
                                        reference: sale.reference,
                                    })}
                                />
                                <dl>
                                    <div>
                                        <dt>{t('Latitude')}</dt>
                                        <dd>{coordinates(sale.creation_location.latitude)}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('Longitude')}</dt>
                                        <dd>{coordinates(sale.creation_location.longitude)}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('Accuracy')}</dt>
                                        <dd>
                                            {sale.creation_location.accuracy_meters === null
                                                ? t('Not reported')
                                                : `±${sale.creation_location.accuracy_meters} m`}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>{t('Captured')}</dt>
                                        <dd>{dateTime(sale.creation_location.captured_at)}</dd>
                                    </div>
                                </dl>
                                <a
                                    className="sale-location-map__link"
                                    href={
                                        mapLinks(sale.creation_location.latitude, sale.creation_location.longitude).open
                                    }
                                    rel="noreferrer"
                                    target="_blank"
                                >
                                    <Icon name="location" size={14} />
                                    {t('Open larger map')}
                                </a>
                            </div>
                        ) : (
                            <div className="sale-location-map__empty">
                                <Icon name="location" size={20} />
                                <span>
                                    <strong>{t('Location unavailable')}</strong>
                                    <small>
                                        {t('This sale was created before device location capture was enabled.')}
                                    </small>
                                </span>
                            </div>
                        )}
                    </Panel>
                </div>
            </div>
            <Dialog
                description={t(
                    'Voiding creates compensating stock and financial entries. The original sale remains in the audit trail.',
                )}
                footer={
                    <>
                        <Button disabled={working} onClick={() => setVoidOpen(false)}>
                            {t('Keep sale')}
                        </Button>
                        <Button
                            disabled={working || !reason.trim()}
                            onClick={() => void voidSale()}
                            requiresOnline
                            tone="danger"
                        >
                            {t(working ? 'Voiding…' : 'Void sale')}
                        </Button>
                    </>
                }
                onClose={() => setVoidOpen(false)}
                open={voidOpen}
                title={t('Void {reference}?', { reference: sale.reference })}
                width="compact"
            >
                <label className="ui-field">
                    <span>{t('Reason')}</span>
                    <textarea
                        autoFocus
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={t('Explain why this sale must be reversed')}
                        rows={4}
                        value={reason}
                    />
                </label>
            </Dialog>
        </div>
    );
}
