import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import { inventoryApi, type StockImport } from '../../services/inventory';
import { Icon } from '../../ui/icons';
import { Button, Dialog, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

function statusTone(status: StockImport['status']) {
    return status === 'posted' ? 'success' : status === 'voided' ? 'danger' : 'warning';
}

function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function StockImportDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const { importId } = useParams();
    const navigate = useNavigate();
    const { user } = useSession();
    const id = Number(importId);
    const canImport = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('inventory.import'));
    const [record, setRecord] = useState<StockImport | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [confirmPost, setConfirmPost] = useState(false);
    const [confirmVoid, setConfirmVoid] = useState(false);
    const [voidReason, setVoidReason] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError(t('Invalid stock import reference.'));
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await inventoryApi.importRecord(id);
            setRecord(response.data);
        } catch (requestError) {
            setError(message(requestError, t('Unable to load the stock import.')));
        } finally {
            setLoading(false);
        }
    }, [id, t]);

    useEffect(() => {
        let active = true;
        if (!Number.isInteger(id) || id < 1) {
            queueMicrotask(() => {
                if (!active) return;
                setError(t('Invalid stock import reference.'));
                setLoading(false);
            });
            return () => {
                active = false;
            };
        }
        void inventoryApi
            .importRecord(id)
            .then((response) => {
                if (!active) return;
                setRecord(response.data);
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to load the stock import.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, t]);

    const runCommand = async (operation: () => Promise<{ data: StockImport }>, success: string) => {
        setWorking(true);
        setError('');
        try {
            const response = await operation();
            setRecord(response.data);
            setNotice(success);
            setConfirmPost(false);
            setConfirmVoid(false);
            setVoidReason('');
        } catch (requestError) {
            setError(message(requestError, t('Unable to load the stock import.')));
        } finally {
            setWorking(false);
        }
    };

    if (loading && !record) {
        return (
            <div className="ui-loading" role="status">
                <span />
                {t('Loading stock import…')}
            </div>
        );
    }

    if (!record) {
        return (
            <div className="admin-page stock-import-detail-page">
                <Link className="sale-detail-back" to="/admin/inventory">
                    <Icon name="chevronLeft" size={13} />
                    {t('Inventory')}
                </Link>
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error || t('Stock import not found.')}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-page stock-import-detail-page">
            <header className="page-heading stock-import-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/inventory">
                        <Icon name="chevronLeft" size={13} />
                        {t('Inventory imports')}
                    </Link>
                    <p className="ui-eyebrow">{t('Stock import')}</p>
                    <h1>{record.reference}</h1>
                    <p>
                        {record.warehouse.name} · {t('Created {date}', { date: dateTime(record.created_at) })}
                    </p>
                </div>
                <div className="stock-import-detail-actions">
                    <StatusBadge tone={statusTone(record.status)}>{t(record.status)}</StatusBadge>
                    {canImport && record.status === 'draft' ? (
                        <>
                            <Button icon="edit" onClick={() => navigate(`/admin/inventory/imports/${record.id}/edit`)}>
                                {t('Edit draft')}
                            </Button>
                            <Button icon="check" onClick={() => setConfirmPost(true)} requiresOnline tone="primary">
                                {t('Post import')}
                            </Button>
                        </>
                    ) : null}
                    {canImport && record.status === 'posted' ? (
                        <Button icon="reverse" onClick={() => setConfirmVoid(true)} requiresOnline tone="danger">
                            {t('Void import')}
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

            <section aria-label={t('Import summary')} className="metric-grid stock-import-detail-kpis">
                <MetricCard
                    hint={t('Distinct product lines')}
                    icon="box"
                    label={t('Items')}
                    value={formatNumber(record.items.length)}
                />
                <MetricCard
                    hint={t('Base stock received')}
                    icon="warehouse"
                    label={t('Total base quantity')}
                    value={formatNumber(record.total_quantity)}
                />
            </section>

            <div className="stock-import-detail-grid">
                <Panel className="stock-import-items" eyebrow={t('Import contents')} title={t('Product lines')}>
                    <div className="ui-table-wrap">
                        <table className="ui-table">
                            <thead>
                                <tr>
                                    <th>{t('Product')}</th>
                                    <th>{t('Unit')}</th>
                                    <th className="is-numeric">{t('Import quantity')}</th>
                                    <th className="is-numeric">{t('Base stock')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {record.items.map((item) => (
                                    <tr key={item.id ?? item.product.id}>
                                        <td>
                                            <strong>{item.product.name}</strong>
                                            <small>{item.product.sku}</small>
                                        </td>
                                        <td>
                                            <strong>{item.product_unit?.name ?? item.product.unit}</strong>
                                            <small>
                                                {t('{count} base units each', {
                                                    count: formatNumber(item.product_unit?.conversion_factor ?? 1),
                                                })}
                                            </small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(item.quantity)}</strong>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(item.base_quantity)}</strong>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={3}>{t('Total base stock')}</td>
                                    <td className="is-numeric">
                                        <strong>{formatNumber(record.total_quantity)}</strong>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Panel>

                <div className="stock-import-detail-side">
                    <Panel eyebrow={t('Document')} title={t('Import details')}>
                        <dl className="stock-import-detail-facts">
                            <div>
                                <dt>{t('Warehouse')}</dt>
                                <dd>
                                    {record.warehouse.name}
                                    <small>{record.warehouse.code}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Created by')}</dt>
                                <dd>
                                    {record.created_by.name}
                                    <small>{dateTime(record.created_at)}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Posted by')}</dt>
                                <dd>
                                    {record.posted_by?.name ?? t('Not posted')}
                                    <small>{dateTime(record.posted_at)}</small>
                                </dd>
                            </div>
                            <div>
                                <dt>{t('Voided by')}</dt>
                                <dd>
                                    {record.voided_by?.name ?? t('Not voided')}
                                    <small>{dateTime(record.voided_at)}</small>
                                </dd>
                            </div>
                            <div className="is-wide">
                                <dt>{t('Notes')}</dt>
                                <dd>{record.notes || t('No notes recorded')}</dd>
                            </div>
                            {record.void_reason ? (
                                <div className="is-wide is-danger">
                                    <dt>{t('Void reason')}</dt>
                                    <dd>{record.void_reason}</dd>
                                </div>
                            ) : null}
                        </dl>
                    </Panel>
                </div>
            </div>

            <Dialog
                description={t('Posting adds all quantities to warehouse stock and makes this import immutable.')}
                footer={
                    <>
                        <Button disabled={working} onClick={() => setConfirmPost(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={working}
                            onClick={() =>
                                void runCommand(
                                    () => inventoryApi.postImport(record.id),
                                    t('{reference} posted successfully.', { reference: record.reference }),
                                )
                            }
                            requiresOnline
                            tone="primary"
                        >
                            {t(working ? 'Posting…' : 'Post import')}
                        </Button>
                    </>
                }
                onClose={() => setConfirmPost(false)}
                open={confirmPost}
                title={t('Post this stock import?')}
                width="compact"
            >
                <p className="stock-import-confirm-summary">
                    {t('{quantity} base units across {lines} product lines will be added to {warehouse}.', {
                        quantity: formatNumber(record.total_quantity),
                        lines: formatNumber(record.items.length),
                        warehouse: record.warehouse.name,
                    })}
                </p>
            </Dialog>

            <Dialog
                description={t(
                    'Voiding reverses the posted inventory movement. This action is recorded in the audit trail.',
                )}
                footer={
                    <>
                        <Button disabled={working} onClick={() => setConfirmVoid(false)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={working || !voidReason.trim()}
                            onClick={() =>
                                void runCommand(
                                    () => inventoryApi.voidImport(record.id, voidReason.trim()),
                                    t('{reference} voided successfully.', { reference: record.reference }),
                                )
                            }
                            requiresOnline
                            tone="danger"
                        >
                            {t(working ? 'Voiding…' : 'Void import')}
                        </Button>
                    </>
                }
                onClose={() => setConfirmVoid(false)}
                open={confirmVoid}
                title={t('Void this stock import?')}
                width="compact"
            >
                <label className="ui-field">
                    <span>{t('Reason')}</span>
                    <textarea
                        autoFocus
                        maxLength={500}
                        onChange={(event) => setVoidReason(event.target.value)}
                        placeholder={t('Explain why this import must be reversed')}
                        rows={4}
                        value={voidReason}
                    />
                </label>
            </Dialog>
        </div>
    );
}
