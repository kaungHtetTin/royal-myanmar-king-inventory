import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { saleApi, type Sale, type SaleStatus } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { InvoicePrintButton } from '../../ui/invoice-print-dialog';
import { Button, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

function statusTone(status: SaleStatus) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

function requestMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function SaleHistoryDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const { saleId } = useParams();
    const id = Number(saleId);
    const [sale, setSale] = useState<Sale | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError(t('This sale reference is invalid.'));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await saleApi.ownSale(id);
            setSale(response.data);
        } catch (requestError) {
            setError(requestMessage(requestError, t('Unable to load the sale detail.')));
        } finally {
            setLoading(false);
        }
    }, [id, t]);

    useEffect(() => {
        let active = true;
        const operation =
            Number.isInteger(id) && id > 0
                ? saleApi.ownSale(id)
                : Promise.reject(new Error(t('This sale reference is invalid.')));
        void operation
            .then((response) => {
                if (active) setSale(response.data);
            })
            .catch((requestError) => {
                if (active) setError(requestMessage(requestError, t('Unable to load the sale detail.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, t]);

    return (
        <div className="sales-sale-detail-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/sales/sales-history">
                        <Icon name="chevronLeft" size={16} />
                        {t('Sales')}
                    </Link>
                    <h1>{sale?.reference ?? t('Sale detail')}</h1>
                    <p>{sale ? `${sale.customer.name} · ${dateTime(sale.created_at)}` : t('Customer sale record')}</p>
                </div>
                {sale ? (
                    <div className="sale-detail-heading__actions">
                        <StatusBadge tone={statusTone(sale.status)}>{t(sale.status)}</StatusBadge>
                        {sale.status !== 'draft' ? (
                            <InvoicePrintButton
                                onBlocked={() => setError(t('Allow pop-ups to print the invoice.'))}
                                sale={sale}
                            />
                        ) : null}
                        {sale.status === 'draft' ? (
                            <Link className="ui-button ui-button--primary" to={`/sales/new-sale?edit=${sale.id}`}>
                                <Icon name="edit" size={16} />
                                <span>{t('Edit draft')}</span>
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
                        {t('Retry')}
                    </Button>
                </div>
            ) : null}

            {loading ? (
                <div className="sales-section ui-loading" role="status">
                    <span />
                    {t('Loading sale detail…')}
                </div>
            ) : sale ? (
                <>
                    <section className="sales-section sale-detail-overview">
                        <header>
                            <div>
                                <p className="ui-eyebrow">{t('Transaction')}</p>
                                <h2>{t('Sale information')}</h2>
                            </div>
                        </header>
                        <dl className="sale-detail-facts">
                            <div>
                                <dt>{t('Customer')}</dt>
                                <dd>
                                    <strong>{sale.customer.name}</strong>
                                    <small>{sale.customer.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Payment type')}</dt>
                                <dd>{t(sale.payment_type)}{sale.payment_method ? ` · ${sale.payment_method_name ?? t(sale.payment_method)}` : ''}</dd>
                            </div>
                            <div>
                                <dt>{t('Warehouse')}</dt>
                                <dd>
                                    <strong>{sale.warehouse.name}</strong>
                                    <small>{sale.warehouse.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Region')}</dt>
                                <dd>
                                    <strong>{sale.region?.name ?? '—'}</strong>
                                    <small>
                                    </small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Created')}</dt>
                                <dd>{dateTime(sale.created_at)}</dd>
                            </div>
                            <div>
                                <dt>{t('Posted')}</dt>
                                <dd>{dateTime(sale.posted_at)}</dd>
                            </div>
                            <div>
                                <dt>{t('Voided')}</dt>
                                <dd>{dateTime(sale.voided_at)}</dd>
                            </div>
                            <div className="sale-detail-facts__notes">
                                <dt>{t('Notes')}</dt>
                                <dd>{sale.notes || t('No notes')}</dd>
                            </div>
                            {sale.void_reason ? (
                                <div className="sale-detail-facts__notes is-danger">
                                    <dt>{t('Void reason')}</dt>
                                    <dd>{sale.void_reason}</dd>
                                </div>
                            ) : null}
                        </dl>
                    </section>

                    <section className="sales-section sale-detail-items">
                        <header>
                            <div>
                                <p className="ui-eyebrow">{t('Products sold')}</p>
                                <h2>{t('Line items')}</h2>
                            </div>
                            <small>
                                {t('{sold} sold · {foc} FOC', {
                                    sold: formatNumber(sale.total_quantity),
                                    foc: formatNumber(sale.total_foc_quantity ?? 0),
                                })}
                            </small>
                        </header>
                        <div className="ui-table-wrap sale-detail-items__table-wrap">
                            <table className="ui-table sale-detail-items__table">
                                <caption className="sr-only">{t('Sale line items')}</caption>
                                <thead>
                                    <tr>
                                        <th>{t('Product')}</th>
                                        <th>{t('Unit')}</th>
                                        <th className="is-numeric">{t('Paid qty')}</th>
                                        <th className="is-numeric">{t('FOC')}</th>
                                        <th className="is-numeric">{t('Unit price')}</th>
                                        <th className="is-numeric">{t('Discount')}</th>
                                        <th className="is-numeric">{t('Line total')}</th>
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
                                            <td className="is-numeric">{formatNumber(item.quantity)}</td>
                                            <td className="is-numeric">
                                                {item.foc_quantity ? (
                                                    <>
                                                        <strong>{formatNumber(item.foc_quantity)}</strong>
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
                                            <td className="is-numeric">{(item.discount_percentage ?? 0) > 0 ? `${item.discount_percentage}% · ${money(item.discount_amount ?? 0)}` : '—'}{item.promotion_amount ? <small>{item.promotion_title || t('Promotion')}: -{money(item.promotion_amount)}</small> : null}</td>
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
                                {t('{products} products · {sold} sold · {foc} FOC', {
                                    products: formatNumber(sale.items.length),
                                    sold: formatNumber(sale.total_quantity),
                                    foc: formatNumber(sale.total_foc_quantity ?? 0),
                                })}
                            </span>
                            <div>
                                {sale.cashback_amount ? <small>{t('Cashback amount')} · -{money(sale.cashback_amount)}</small> : null}
                                {sale.promotion_amount ? <small>{sale.promotion_title} · -{money(sale.promotion_amount)}</small> : null}
                                <small>{t('Sale total')}</small>
                                <strong>{money(sale.total_amount)}</strong>
                            </div>
                        </footer>
                    </section>
                </>
            ) : null}
        </div>
    );
}
