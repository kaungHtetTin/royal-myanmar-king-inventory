import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import {
    transferApi,
    type RepresentativeTransfer,
    type TransferStatus,
    type WarehouseTransfer,
} from '../../services/transfers';
import { Icon } from '../../ui/icons';
import { Button, Dialog, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

type TransferRecord = WarehouseTransfer | RepresentativeTransfer;
type TransferKind = 'warehouse' | 'representative' | 'representative-return';

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const tone = (status: TransferStatus) =>
    status === 'received'
        ? 'success'
        : status === 'dispatched'
          ? 'info'
          : status === 'draft'
            ? 'warning'
            : status === 'reversed'
              ? 'danger'
              : 'neutral';

export function TransferDetailPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('—'));
    const { transferId, transferType } = useParams();
    const navigate = useNavigate();
    const { user } = useSession();
    const id = Number(transferId);
    const kind: TransferKind | null =
        transferType === 'warehouse' || transferType === 'representative' || transferType === 'representative-return'
            ? transferType
            : null;
    const isSuper = user?.roles.includes('super-admin');
    const allowed = (permission: string) => Boolean(isSuper || user?.permissions.includes(permission));
    const [record, setRecord] = useState<TransferRecord | null>(null);
    const [loading, setLoading] = useState(true);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [command, setCommand] = useState<'dispatch' | 'receive' | 'cancel' | 'reverse' | null>(null);
    const [reason, setReason] = useState('');

    const fetchRecord = useCallback(() => {
        if (!kind || !Number.isInteger(id) || id < 1)
            return Promise.reject(new Error(t('Invalid transfer reference.')));
        return kind === 'warehouse'
            ? transferApi.warehouseTransfer(id)
            : kind === 'representative-return'
              ? transferApi.representativeReturn(id)
              : transferApi.representativeTransfer(id);
    }, [id, kind, t]);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setRecord((await fetchRecord()).data);
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to load the transfer record.')));
        } finally {
            setLoading(false);
        }
    }, [fetchRecord, t]);

    useEffect(() => {
        let active = true;
        void fetchRecord()
            .then((response) => {
                if (active) {
                    setRecord(response.data);
                    setError('');
                }
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError, t('Unable to load the transfer record.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [fetchRecord, t]);

    const inTransit = useMemo(
        () => record?.items.reduce((sum, item) => sum + item.in_transit_quantity, 0) ?? 0,
        [record],
    );
    const paidBaseTotal = useMemo(
        () => record?.items.reduce((sum, item) => sum + (item.base_quantity ?? item.quantity), 0) ?? 0,
        [record],
    );
    const focBaseTotal = useMemo(
        () => record?.items.reduce((sum, item) => sum + (item.foc_base_quantity ?? 0), 0) ?? 0,
        [record],
    );
    const destination =
        record && 'destination_warehouse' in record
            ? record.destination_warehouse
            : record && 'representative' in record
              ? record.representative
              : null;
    const routeLabel =
        record && kind === 'representative-return' && 'representative' in record
            ? `${record.representative.name} → ${record.source_warehouse.name}`
            : record
              ? `${record.source_warehouse.name} → ${destination?.name}`
              : '';

    const execute = async () => {
        if (!record || !kind || !command) return;
        setWorking(true);
        setError('');
        try {
            let response;
            if (kind === 'warehouse') {
                response =
                    command === 'dispatch' || command === 'receive'
                        ? await transferApi.warehouseCommand(record.id, command)
                        : await transferApi.warehouseReasonCommand(record.id, command, reason.trim());
            } else if (kind === 'representative') {
                response =
                    command === 'dispatch'
                        ? await transferApi.representativeCommand(record.id, command)
                        : await transferApi.representativeReasonCommand(
                              record.id,
                              command as 'cancel' | 'reverse',
                              reason.trim(),
                          );
            } else {
                response =
                    command === 'dispatch'
                        ? await transferApi.representativeReturnCommand(record.id, 'post')
                        : await transferApi.representativeReturnReasonCommand(
                              record.id,
                              command as 'cancel' | 'reverse',
                              reason.trim(),
                          );
            }
            setRecord(response.data);
            const completed =
                command === 'receive'
                    ? 'received'
                    : command === 'dispatch'
                      ? 'dispatched'
                      : command === 'cancel'
                        ? 'cancelled'
                        : 'reversed';
            setNotice(
                t('{reference} {status} successfully.', {
                    reference: record.reference,
                    status: t(completed),
                }),
            );
            setCommand(null);
            setReason('');
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to load the transfer record.')));
        } finally {
            setWorking(false);
        }
    };

    if (loading && !record)
        return (
            <div className="ui-loading" role="status">
                <span />
                {t('Loading transfer record…')}
            </div>
        );
    if (!record || !kind)
        return (
            <div className="admin-page transfer-detail-page">
                <Link className="sale-detail-back" to="/admin/transfers">
                    <Icon name="chevronLeft" size={13} />
                    {t('Transfers')}
                </Link>
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error || t('Transfer not found.')}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            </div>
        );

    const canEdit =
        record.status === 'draft' &&
        (kind === 'warehouse'
            ? allowed('warehouse_transfer.create')
            : kind === 'representative-return'
              ? allowed('representative_stock.issue')
              : false);
    const canCancel =
        record.status === 'draft' &&
        (kind === 'warehouse' ? allowed('warehouse_transfer.create') : allowed('representative_stock.issue'));
    const canDispatch =
        record.status === 'draft' &&
        (kind === 'warehouse' ? allowed('warehouse_transfer.dispatch') : allowed('representative_stock.issue'));
    const canReceive = kind === 'warehouse' && record.status === 'dispatched' && allowed('warehouse_transfer.receive');
    const canReverse =
        ['dispatched', 'received'].includes(record.status) &&
        (kind === 'warehouse' ? allowed('warehouse_transfer.reverse') : allowed('representative_stock.issue'));
    const showFoc = kind !== 'warehouse';

    return (
        <div className="admin-page transfer-detail-page">
            <header className="page-heading transfer-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/transfers">
                        <Icon name="chevronLeft" size={13} />
                        {t('Transfer records')}
                    </Link>
                    <p className="ui-eyebrow">
                        {kind === 'warehouse'
                            ? t('Warehouse transfer')
                            : kind === 'representative-return'
                              ? t('Representative return')
                              : t('Representative issue')}
                    </p>
                    <h1>{record.reference}</h1>
                    <p>
                        {routeLabel} · {t('Created {date}', { date: dateTime(record.created_at) })}
                    </p>
                </div>
                <div className="transfer-detail-actions">
                    <StatusBadge tone={tone(record.status)}>{t(record.status)}</StatusBadge>
                    {canEdit ? (
                        <Button
                            icon="edit"
                            onClick={() =>
                                navigate(
                                    kind === 'representative-return'
                                        ? `/admin/transfers/representative-return/${record.id}/edit`
                                        : `/admin/transfers/warehouse/${record.id}/edit`,
                                )
                            }
                        >
                            {t('Edit draft')}
                        </Button>
                    ) : null}
                    {canDispatch ? (
                        <Button icon="truck" onClick={() => setCommand('dispatch')} requiresOnline tone="primary">
                            {t(kind === 'representative-return' ? 'Post return' : 'Dispatch')}
                        </Button>
                    ) : null}
                    {canReceive ? (
                        <Button icon="check" onClick={() => setCommand('receive')} requiresOnline tone="primary">
                            {t('Receive')}
                        </Button>
                    ) : null}
                    {canCancel ? (
                        <Button icon="x" onClick={() => setCommand('cancel')} requiresOnline>
                            {t('Cancel')}
                        </Button>
                    ) : null}
                    {canReverse ? (
                        <Button icon="reverse" onClick={() => setCommand('reverse')} requiresOnline tone="danger">
                            {t('Reverse')}
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
            <section aria-label={t('Transfer summary')} className="metric-grid transfer-detail-kpis">
                <MetricCard
                    hint={t('Distinct product lines')}
                    icon="box"
                    label={t('Products')}
                    value={formatNumber(record.items.length)}
                />
                <MetricCard
                    hint={t('Total base stock on document')}
                    icon="warehouse"
                    label={t('Base quantity')}
                    value={formatNumber(paidBaseTotal + focBaseTotal)}
                />
                <MetricCard
                    hint={t(record.status === 'dispatched' ? 'Currently moving' : 'No units currently moving')}
                    icon="truck"
                    label={t('In transit')}
                    value={formatNumber(inTransit)}
                />
            </section>
            <div className="transfer-detail-grid">
                <Panel className="transfer-detail-items" eyebrow={t('Transfer contents')} title={t('Product lines')}>
                    <div className="ui-table-wrap">
                        <table
                            aria-label={t('Transfer product lines')}
                            className={`ui-table${showFoc ? ' has-foc' : ''}`}
                        >
                            <thead>
                                <tr>
                                    <th>{t('Product')}</th>
                                    <th>{t('Unit')}</th>
                                    <th className="is-numeric">{t('Transfer quantity')}</th>
                                    {showFoc ? <th className="is-numeric">{t('FOC')}</th> : null}
                                    <th className="is-numeric">{t(showFoc ? 'Paid base' : 'Base stock')}</th>
                                    <th className="is-numeric">{t('In transit')}</th>
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
                                            <strong>{item.unit?.name ?? item.product.unit}</strong>
                                            <small>
                                                {t('{count} base units each', {
                                                    count: formatNumber(item.unit?.conversion_factor ?? 1),
                                                })}
                                            </small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(item.quantity)}</strong>
                                        </td>
                                        {showFoc ? (
                                            <td className="is-numeric">
                                                <strong>{formatNumber(item.foc_quantity ?? 0)}</strong>
                                                {(item.foc_quantity ?? 0) > 0 ? (
                                                    <small>
                                                        {item.foc_unit?.name ?? item.product.unit},{' '}
                                                        {formatNumber(item.foc_base_quantity ?? item.foc_quantity ?? 0)}{' '}
                                                        {t('base')}
                                                    </small>
                                                ) : null}
                                            </td>
                                        ) : null}
                                        <td className="is-numeric">
                                            <strong>{formatNumber(item.base_quantity ?? item.quantity)}</strong>
                                        </td>
                                        <td className="is-numeric">{formatNumber(item.in_transit_quantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colSpan={3}>{t(showFoc ? 'Base totals' : 'Total base stock')}</td>
                                    {showFoc ? (
                                        <td className="is-numeric">
                                            <strong>{formatNumber(focBaseTotal)}</strong>
                                            <small>{t('FOC base')}</small>
                                        </td>
                                    ) : null}
                                    <td className="is-numeric">
                                        <strong>{formatNumber(paidBaseTotal)}</strong>
                                        {showFoc ? <small>{t('Paid base')}</small> : null}
                                    </td>
                                    <td className="is-numeric">
                                        <strong>{formatNumber(inTransit)}</strong>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Panel>
                <Panel eyebrow={t('Document')} title={t('Transfer details')}>
                    <dl className="transfer-detail-facts">
                        <div>
                            <dt>{t('Source')}</dt>
                            <dd>
                                {kind === 'representative-return' && 'representative' in record
                                    ? record.representative.name
                                    : record.source_warehouse.name}
                                <small>
                                    {kind === 'representative-return' && 'representative' in record
                                        ? record.representative.code
                                        : record.source_warehouse.code}
                                </small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Destination')}</dt>
                            <dd>
                                {kind === 'representative-return' ? record.source_warehouse.name : destination?.name}
                                <small>
                                    {kind === 'representative-return'
                                        ? record.source_warehouse.code
                                        : destination?.code}
                                </small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Created by')}</dt>
                            <dd>
                                {record.created_by?.name ?? t('Unknown')}
                                <small>{dateTime(record.created_at)}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Dispatched by')}</dt>
                            <dd>
                                {record.dispatched_by?.name ?? t('Not dispatched')}
                                <small>{dateTime(record.dispatched_at)}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Received by')}</dt>
                            <dd>
                                {record.received_by?.name ?? t('Not received')}
                                <small>{dateTime(record.received_at)}</small>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('Reversed by')}</dt>
                            <dd>
                                {record.reversed_by?.name ?? t('Not reversed')}
                                <small>{dateTime(record.reversed_at)}</small>
                            </dd>
                        </div>
                        <div className="is-wide">
                            <dt>{t('Notes')}</dt>
                            <dd>{record.notes || t('No notes recorded')}</dd>
                        </div>
                        {record.cancel_reason ? (
                            <div className="is-wide is-danger">
                                <dt>{t('Cancellation reason')}</dt>
                                <dd>{record.cancel_reason}</dd>
                            </div>
                        ) : null}
                        {record.reversal_reason ? (
                            <div className="is-wide is-danger">
                                <dt>{t('Reversal reason')}</dt>
                                <dd>{record.reversal_reason}</dd>
                            </div>
                        ) : null}
                    </dl>
                </Panel>
            </div>
            <Dialog
                description={
                    command === 'dispatch'
                        ? kind === 'representative-return'
                            ? t('Posting moves these units from representative custody into the target warehouse.')
                            : t('Dispatching moves these units into transit.')
                        : command === 'receive'
                          ? t('Receiving moves all in-transit units into destination stock.')
                          : t('A reason is required and will be recorded in the audit trail.')
                }
                footer={
                    <>
                        <Button
                            disabled={working}
                            onClick={() => {
                                setCommand(null);
                                setReason('');
                            }}
                        >
                            {t('Keep transfer')}
                        </Button>
                        <Button
                            disabled={working || ((command === 'cancel' || command === 'reverse') && !reason.trim())}
                            onClick={() => void execute()}
                            requiresOnline
                            tone={command === 'cancel' || command === 'reverse' ? 'danger' : 'primary'}
                        >
                            {working
                                ? t('Working…')
                                : command === 'receive'
                                  ? t('Receive transfer')
                                  : command === 'dispatch'
                                    ? kind === 'representative-return'
                                        ? t('Post return')
                                        : t('Dispatch transfer')
                                    : command === 'cancel'
                                      ? t('Cancel transfer')
                                      : t('Reverse transfer')}
                        </Button>
                    </>
                }
                onClose={() => {
                    setCommand(null);
                    setReason('');
                }}
                open={command !== null}
                title={t('{action} {reference}?', {
                    action: t(
                        command === 'receive'
                            ? 'Receive'
                            : command === 'dispatch'
                              ? 'Dispatch'
                              : command === 'cancel'
                                ? 'Cancel'
                                : 'Reverse',
                    ),
                    reference: record.reference,
                })}
                width="compact"
            >
                {command === 'cancel' || command === 'reverse' ? (
                    <label className="ui-field">
                        <span>{t('Reason')}</span>
                        <textarea
                            autoFocus
                            maxLength={500}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder={t('Explain why this transfer must change state')}
                            rows={4}
                            value={reason}
                        />
                    </label>
                ) : (
                    <p className="transfer-confirm-summary">
                        {t('{count} base units across {products} product lines.', {
                            count: formatNumber(record.total_quantity),
                            products: formatNumber(record.items.length),
                        })}
                    </p>
                )}
            </Dialog>
        </div>
    );
}
