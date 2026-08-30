import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { transferApi, type RepresentativeTransfer } from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { Button, Dialog, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const message = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function ReceivingDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const { transferId } = useParams();
    const navigate = useNavigate();
    const id = Number(transferId);
    const [transfer, setTransfer] = useState<RepresentativeTransfer | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [approveOpen, setApproveOpen] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setTransfer((await transferApi.ownReceiving(id)).data);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load this receiving.')));
        } finally {
            setLoading(false);
        }
    }, [id, t]);
    useEffect(() => {
        let active = true;
        void transferApi
            .ownReceiving(id)
            .then((response) => {
                if (active) setTransfer(response.data);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load this receiving.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, t]);
    const submit = async () => {
        if (!transfer) return;
        setWorking(true);
        setError('');
        try {
            await transferApi.receiveOwn(transfer.id);
            navigate('/sales/dashboard');
        } catch (requestError) {
            setError(message(requestError, t('Unable to load this receiving.')));
        } finally {
            setWorking(false);
        }
    };
    if (loading && !transfer)
        return (
            <div className="ui-loading" role="status">
                <span />
                {t('Loading receiving…')}
            </div>
        );
    if (!transfer)
        return (
            <div className="receiving-detail-page">
                <Link className="sale-detail-back" to="/sales/dashboard">
                    <Icon name="chevronLeft" size={13} />
                    {t('Dashboard')}
                </Link>
                <div className="ui-flash ui-flash--danger">
                    {error || t('Receiving not found.')}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            </div>
        );
    const isPending = transfer.status === 'dispatched';
    const backPath = isPending ? '/sales/my-stock' : '/sales/my-stock?tab=history';
    const statusTone = transfer.status === 'received' ? 'success' : transfer.status === 'reversed' ? 'danger' : 'info';
    const paidBaseTotal = transfer.items.reduce((sum, item) => sum + (item.base_quantity ?? item.quantity), 0);
    const focBaseTotal = transfer.items.reduce((sum, item) => sum + (item.foc_base_quantity ?? 0), 0);
    const physicalBaseTotal = paidBaseTotal + focBaseTotal;
    return (
        <div className="receiving-detail-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to={backPath}>
                        <Icon name="chevronLeft" size={13} />
                        {t(isPending ? 'Pending stock' : 'Issue history')}
                    </Link>
                    <p className="ui-eyebrow">{t('Stock receiving')}</p>
                    <h1>{transfer.reference}</h1>
                    <p>
                        {transfer.source_warehouse.name} ·{' '}
                        {t('Dispatched {date}', { date: dateTime(transfer.dispatched_at) })}
                    </p>
                </div>
                <StatusBadge tone={statusTone}>
                    {transfer.status === 'received'
                        ? t('Received')
                        : transfer.status === 'reversed'
                          ? t('Reversed')
                          : t('In transit')}
                </StatusBadge>
            </header>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                </div>
            ) : null}
            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">{t('Shipment contents')}</p>
                        <h2>
                            {t('{products} products · {quantity} base units', {
                                products: formatNumber(transfer.items.length),
                                quantity: formatNumber(physicalBaseTotal),
                            })}
                        </h2>
                    </div>
                </header>
                <div className="receiving-detail-items">
                    <table aria-label={t('Receiving product lines')} className="receiving-detail-table">
                        <thead>
                            <tr>
                                <th>{t('Product')}</th>
                                <th className="is-numeric">{t('Paid')}</th>
                                <th className="is-numeric">{t('FOC')}</th>
                                <th className="is-numeric">{t('Total base')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfer.items.map((item) => {
                                const paidBase = item.base_quantity ?? item.quantity;
                                const focBase = item.foc_base_quantity ?? 0;

                                return (
                                    <tr key={item.id ?? item.product.id}>
                                        <td>
                                            <strong>{item.product.name}</strong>
                                            <small>{item.product.sku}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(item.quantity)}</strong>
                                            <small>
                                                {t('{unit}, {quantity} base', {
                                                    unit: item.unit?.name ?? item.product.unit,
                                                    quantity: formatNumber(paidBase),
                                                })}
                                            </small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(item.foc_quantity ?? 0)}</strong>
                                            <small>
                                                {t('{unit}, {quantity} base', {
                                                    unit: item.foc_unit?.name ?? item.product.unit,
                                                    quantity: formatNumber(focBase),
                                                })}
                                            </small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(paidBase + focBase)}</strong>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>{t('Total base')}</td>
                                <td className="is-numeric">
                                    <strong>{formatNumber(paidBaseTotal)}</strong>
                                </td>
                                <td className="is-numeric">
                                    <strong>{formatNumber(focBaseTotal)}</strong>
                                </td>
                                <td className="is-numeric">
                                    <strong>{formatNumber(physicalBaseTotal)}</strong>
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </section>
            {isPending ? (
                <div className="stock-import-form-page__actions">
                    <Button icon="check" onClick={() => setApproveOpen(true)} requiresOnline tone="primary">
                        {t('Approve receipt')}
                    </Button>
                </div>
            ) : null}
            <Dialog
                description={t(
                    'Confirm that every listed quantity was received. Stock will be added to your inventory.',
                )}
                footer={
                    <>
                        <Button disabled={working} onClick={() => setApproveOpen(false)}>
                            {t('Go back')}
                        </Button>
                        <Button disabled={working} onClick={() => void submit()} requiresOnline tone="primary">
                            {t(working ? 'Working…' : 'Approve all received')}
                        </Button>
                    </>
                }
                onClose={() => setApproveOpen(false)}
                open={approveOpen}
                title={t('Approve {reference}?', { reference: transfer.reference })}
                width="compact"
            >
                <p>
                    {t('Approve {quantity} base units from {warehouse}.', {
                        quantity: formatNumber(physicalBaseTotal),
                        warehouse: transfer.source_warehouse.name,
                    })}
                </p>
            </Dialog>
        </div>
    );
}
