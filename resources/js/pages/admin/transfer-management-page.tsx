import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    TransferApiError,
    transferApi,
    type ProductOption,
    type RepresentativeInventory,
    type RepresentativeTransfer,
    type RepresentativeTransferInput,
    type RepresentativeTransferOptions,
    type TransferFilters,
    type TransferSummary,
    type WarehouseTransfer,
    type WarehouseTransferInput,
    type WarehouseTransferOptions,
} from '../../services/transfers';
import { Icon, type IconName } from '../../ui/icons';
import { editableNumber } from '../../ui/form-values';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

type Tab = 'warehouse' | 'representative' | 'return' | 'stock';
const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptySummary: TransferSummary = { in_transit: 0, products: 0, total: 0, units: 0 };
const emptyWarehouseOptions: WarehouseTransferOptions = {
    destination_warehouses: [],
    products: [],
    source_warehouses: [],
};
const emptyRepresentativeOptions: RepresentativeTransferOptions = {
    products: [],
    representatives: [],
    source_warehouses: [],
};
const labels: Record<Tab, string> = {
    warehouse: 'Warehouse transfers',
    representative: 'Representative issues',
    return: 'Representative returns',
    stock: 'Representative stock',
};
const tabIcons: Record<Tab, IconName> = {
    warehouse: 'warehouse',
    representative: 'users',
    return: 'reverse',
    stock: 'box',
};
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
function tone(status: string) {
    return status === 'received'
        ? 'success'
        : status === 'dispatched'
          ? 'info'
          : status === 'draft'
            ? 'warning'
            : status === 'reversed'
              ? 'danger'
              : 'neutral';
}

export function TransferManagementPage() {
    const navigate = useNavigate();
    const { formatNumber, t } = useLocale();
    const { user } = useSession();
    const superAdmin = user?.roles.includes('super-admin');
    const allowed = (permission: string) => Boolean(superAdmin || user?.permissions.includes(permission));
    const canViewWarehouse = allowed('warehouse_transfer.view');
    const canCreateWarehouse = allowed('warehouse_transfer.create');
    const canDispatchWarehouse = allowed('warehouse_transfer.dispatch');
    const canReceiveWarehouse = allowed('warehouse_transfer.receive');
    const canReverseWarehouse = allowed('warehouse_transfer.reverse');
    const canViewRepresentative = allowed('representative_stock.view');
    const canIssue = allowed('representative_stock.issue');
    const availableTabs = useMemo(
        () => [
            ...(canViewWarehouse ? ['warehouse' as Tab] : []),
            ...(canViewRepresentative ? ['representative' as Tab] : []),
            ...(canViewRepresentative ? ['return' as Tab] : []),
        ],
        [canViewRepresentative, canViewWarehouse],
    );
    const [tab, setTab] = useState<Tab>(availableTabs[0] ?? 'warehouse');
    const [rows, setRows] = useState<(WarehouseTransfer | RepresentativeTransfer | RepresentativeInventory)[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [filters, setFilters] = useState<TransferFilters>({ page: 1 });
    const [draft, setDraft] = useState({ search: '', status: '' });
    const [, setWarehouseOptions] = useState(emptyWarehouseOptions);
    const [, setRepresentativeOptions] = useState(emptyRepresentativeOptions);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [representativeReasonAction, setRepresentativeReasonAction] = useState<{
        action: 'cancel' | 'reverse';
        id: number;
        reference: string;
    } | null>(null);
    const [representativeReason, setRepresentativeReason] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            if (tab === 'warehouse') {
                const [response, options] = await Promise.all([
                    transferApi.warehouseTransfers(filters),
                    transferApi.warehouseOptions(),
                ]);
                setRows(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                setWarehouseOptions(options);
            } else if (tab === 'representative') {
                const [response, options] = await Promise.all([
                    transferApi.representativeTransfers(filters),
                    transferApi.representativeOptions(),
                ]);
                setRows(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                setRepresentativeOptions(options);
            } else if (tab === 'return') {
                const [response, options] = await Promise.all([
                    transferApi.representativeReturns(filters),
                    transferApi.representativeReturnOptions(),
                ]);
                setRows(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                setRepresentativeOptions(options);
            } else {
                const [response, options] = await Promise.all([
                    transferApi.representativeInventory(filters),
                    transferApi.representativeOptions(),
                ]);
                setRows(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                setRepresentativeOptions(options);
            }
        } catch (requestError) {
            setError(message(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [filters, tab, t]);

    useEffect(() => {
        let active = true;
        const operation =
            tab === 'warehouse'
                ? Promise.all([transferApi.warehouseTransfers(filters), transferApi.warehouseOptions()])
                : tab === 'representative'
                  ? Promise.all([transferApi.representativeTransfers(filters), transferApi.representativeOptions()])
                  : tab === 'return'
                    ? Promise.all([
                          transferApi.representativeReturns(filters),
                          transferApi.representativeReturnOptions(),
                      ])
                    : Promise.all([transferApi.representativeInventory(filters), transferApi.representativeOptions()]);
        void operation
            .then(([response, options]) => {
                if (!active) return;
                setRows(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                if (tab === 'warehouse') setWarehouseOptions(options as WarehouseTransferOptions);
                else setRepresentativeOptions(options as RepresentativeTransferOptions);
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filters, tab, t]);

    const showNotice = (value: string) => {
        setNotice(value);
        window.setTimeout(() => setNotice(''), 4000);
    };
    const command = async (operation: () => Promise<unknown>, value: string) => {
        setLoading(true);
        setError('');
        try {
            await operation();
            await load();
            showNotice(value);
        } catch (requestError) {
            setError(message(requestError, t('Unable to complete the request.')));
            setLoading(false);
        }
    };
    const switchTab = (value: Tab) => {
        setLoading(true);
        setTab(value);
        setRows([]);
        setFilters({ page: 1 });
        setDraft({ search: '', status: '' });
    };
    return (
        <div className="admin-page transfer-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Stock movement')}</p>
                    <h1>{t('Transfers')}</h1>
                    <p>
                        {t(
                            'Move stock through dispatch, in transit, receipt, and controlled reversal without losing custody history.',
                        )}
                    </p>
                </div>
                <div className="page-heading__actions">
                    {tab === 'warehouse' && canCreateWarehouse ? (
                        <Button icon="plus" onClick={() => navigate('/admin/transfers/warehouse/new')} tone="primary">
                            {t('New warehouse transfer')}
                        </Button>
                    ) : null}
                    {tab === 'return' && canIssue ? (
                        <Button icon="reverse" onClick={() => navigate('/admin/transfers/representative-return/new')} tone="primary">
                            {t('Authorize stock return')}
                        </Button>
                    ) : null}
                </div>
            </header>
            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="transfer"
                    label={t(labels[tab])}
                    value={formatNumber(summary.total)}
                />
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="box"
                    label={t('Units')}
                    value={formatNumber(summary.units)}
                />
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="reports"
                    label={t('Products')}
                    value={formatNumber(summary.products)}
                />
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="truck"
                    label={t('In transit rows')}
                    value={formatNumber(summary.in_transit)}
                />
            </div>
            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="transfer" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}
            <Panel className="transfer-panel" eyebrow={t('Custody register')} title={t(labels[tab])}>
                <div className={`section-tabs section-tabs--${availableTabs.length} transfer-tabs`} role="tablist">
                    {availableTabs.map((value) => (
                        <button
                            aria-selected={tab === value}
                            key={value}
                            onClick={() => switchTab(value)}
                            role="tab"
                            type="button"
                        >
                            <Icon name={tabIcons[value]} size={15} />
                            <span>{t(labels[value])}</span>
                            {tab === value ? (
                                <span className="section-tab-count">{formatNumber(meta.total)}</span>
                            ) : null}
                        </button>
                    ))}
                </div>
                <form
                    className="filter-toolbar transfer-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setFilters({
                            page: 1,
                            search: draft.search,
                            status: tab === 'stock' ? undefined : draft.status,
                        });
                    }}
                >
                    <label className="filter-search">
                        <Icon name="search" size={15} />
                        <input
                            aria-label={t('Search transfers')}
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={t(tab === 'stock' ? 'Product or SKU' : 'Transfer reference')}
                            type="search"
                            value={draft.search}
                        />
                    </label>
                    {tab !== 'stock' ? (
                        <select
                            aria-label={t('Transfer status')}
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    status: event.target.value,
                                }))
                            }
                            value={draft.status}
                        >
                            <option value="">{t('All statuses')}</option>
                            <option value="draft">{t('Draft')}</option>
                            <option value="dispatched">{t('Dispatched')}</option>
                            <option value="received">{t('Received')}</option>
                            <option value="cancelled">{t('Cancelled')}</option>
                            <option value="reversed">{t('Reversed')}</option>
                        </select>
                    ) : null}
                    <Button icon="search" type="submit">
                        {t('Apply')}
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        {t('Loading transfers…')}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        description={t('No records match the selected workflow and filters.')}
                        title={t('No {section} found', { section: t(labels[tab]) })}
                    />
                ) : tab === 'warehouse' ? (
                    <WarehouseTable
                        canCreate={canCreateWarehouse}
                        canDispatch={canDispatchWarehouse}
                        canReceive={canReceiveWarehouse}
                        canReverse={canReverseWarehouse}
                        command={command}
                        edit={(row) => navigate(`/admin/transfers/warehouse/${row.id}/edit`)}
                        rows={rows as WarehouseTransfer[]}
                    />
                ) : tab === 'representative' ? (
                    <RepresentativeTable
                        canIssue={canIssue}
                        command={command}
                        edit={(row) => navigate(`/admin/transfers/representative/${row.id}/edit`)}
                        requestReason={(row, action) => {
                            setRepresentativeReason('');
                            setRepresentativeReasonAction({ action, id: row.id, reference: row.reference });
                        }}
                        rows={rows as RepresentativeTransfer[]}
                    />
                ) : tab === 'return' ? (
                    <RepresentativeReturnTable
                        canReturn={canIssue}
                        command={command}
                        edit={(row) => navigate(`/admin/transfers/representative-return/${row.id}/edit`)}
                        requestReason={(row, action) => {
                            setRepresentativeReason('');
                            setRepresentativeReasonAction({ action, id: row.id, reference: row.reference });
                        }}
                        rows={rows as RepresentativeTransfer[]}
                    />
                ) : (
                    <StockTable rows={rows as RepresentativeInventory[]} />
                )}
                <footer className="table-footer">
                    <span>
                        {t('{from}–{to} of {total}', {
                            from: formatNumber(meta.from ?? 0),
                            to: formatNumber(meta.to ?? 0),
                            total: formatNumber(meta.total),
                        })}
                    </span>
                    <button
                        disabled={meta.current_page <= 1 || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page - 1,
                            }))
                        }
                    >
                        {t('Previous')}
                    </button>
                    <strong>
                        {t('Page {current} of {total}', {
                            current: formatNumber(meta.current_page),
                            total: formatNumber(meta.last_page),
                        })}
                    </strong>
                    <button
                        disabled={meta.current_page >= meta.last_page || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page + 1,
                            }))
                        }
                    >
                        {t('Next')}
                    </button>
                </footer>
            </Panel>
            <Dialog
                description={t('Enter a reason for this state change. It will be saved in the audit trail.')}
                footer={
                    <>
                        <Button onClick={() => setRepresentativeReasonAction(null)}>
                            {t('Keep {type}', { type: t(tab === 'return' ? 'return' : 'issue') })}
                        </Button>
                        <Button
                            disabled={loading || !representativeReason.trim()}
                            onClick={() => {
                                if (!representativeReasonAction) return;
                                const current = representativeReasonAction;
                                void command(
                                    () =>
                                        tab === 'return'
                                            ? transferApi.representativeReturnReasonCommand(
                                                  current.id,
                                                  current.action,
                                                  representativeReason.trim(),
                                              )
                                            : transferApi.representativeReasonCommand(
                                                  current.id,
                                                  current.action,
                                                  representativeReason.trim(),
                                              ),
                                    t('{reference} {status}.', {
                                        reference: current.reference,
                                        status: t(current.action === 'cancel' ? 'cancelled' : 'reversed'),
                                    }),
                                ).then(() => {
                                    setRepresentativeReasonAction(null);
                                    setRepresentativeReason('');
                                });
                            }}
                            requiresOnline
                            tone="danger"
                        >
                            {loading
                                ? t('Working…')
                                : representativeReasonAction?.action === 'reverse'
                                  ? t('Reverse {type}', { type: t(tab === 'return' ? 'return' : 'issue') })
                                  : t('Cancel {type}', { type: t(tab === 'return' ? 'return' : 'issue') })}
                        </Button>
                    </>
                }
                onClose={() => {
                    setRepresentativeReasonAction(null);
                    setRepresentativeReason('');
                }}
                open={representativeReasonAction !== null}
                title={t('{action} {reference}?', {
                    action: t(representativeReasonAction?.action === 'reverse' ? 'Reverse' : 'Cancel'),
                    reference:
                        representativeReasonAction?.reference ??
                        t('representative {type}', { type: t(tab === 'return' ? 'return' : 'issue') }),
                })}
                width="compact"
            >
                <label className="ui-field">
                    <span>{t('Reason')}</span>
                    <textarea
                        autoFocus
                        maxLength={500}
                        onChange={(event) => setRepresentativeReason(event.target.value)}
                        placeholder={t('Explain why this {type} must change state', {
                            type: t(tab === 'return' ? 'return' : 'issue'),
                        })}
                        rows={4}
                        value={representativeReason}
                    />
                </label>
            </Dialog>
        </div>
    );
}

function WarehouseTable({
    canCreate,
    canDispatch,
    canReceive,
    canReverse,
    command,
    edit,
    rows,
}: {
    canCreate: boolean;
    canDispatch: boolean;
    canReceive: boolean;
    canReverse: boolean;
    command: (operation: () => Promise<unknown>, message: string) => Promise<void>;
    edit: (row: WarehouseTransfer) => void;
    rows: WarehouseTransfer[];
}) {
    const { formatDateTime, formatNumber, t } = useLocale();
    return (
        <div className="ui-table-wrap">
            <table className="ui-table transfer-table">
                <thead>
                    <tr>
                        <th>{t('Reference')}</th>
                        <th>{t('Route')}</th>
                        <th>{t('Products / units')}</th>
                        <th>{t('Custody')}</th>
                        <th>{t('Status')}</th>
                        <th>{t('Created')}</th>
                        <th className="ui-table__actions">{t('Actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>
                                    <Link
                                        className="inventory-reference-link"
                                        to={`/admin/transfers/warehouse/${row.id}`}
                                    >
                                        {row.reference}
                                    </Link>
                                </strong>
                                <small>{row.created_by?.name}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.source_warehouse.code} → {row.destination_warehouse.code}
                                </span>
                                <small>
                                    {t('{source} to {destination}', {
                                        source: row.source_warehouse.name,
                                        destination: row.destination_warehouse.name,
                                    })}
                                </small>
                            </td>
                            <td>
                                <strong>
                                    {formatNumber(row.items.length)} / {formatNumber(row.total_quantity)}
                                </strong>
                                <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.status === 'dispatched'
                                        ? t('{count} in transit', {
                                              count: formatNumber(
                                                  row.items.reduce((sum, item) => sum + item.in_transit_quantity, 0),
                                              ),
                                          })
                                        : row.status === 'received'
                                          ? t('At destination')
                                          : row.status === 'reversed'
                                            ? t('Returned')
                                            : t('No stock effect')}
                                </span>
                                <small>{row.notes || t('No notes')}</small>
                            </td>
                            <td>
                                <StatusBadge tone={tone(row.status)}>{t(row.status)}</StatusBadge>
                            </td>
                            <td>{row.created_at ? formatDateTime(row.created_at) : '—'}</td>
                            <td className="ui-table__actions">
                                <div className="row-actions">
                                    {row.status === 'draft' && canCreate ? (
                                        <>
                                            <IconButton
                                                icon="edit"
                                                label={t('Edit {name}', { name: row.reference })}
                                                onClick={() => edit(row)}
                                            />
                                            <IconButton
                                                icon="x"
                                                label={t('Cancel {reference}', { reference: row.reference })}
                                                requiresOnline
                                                onClick={() => {
                                                    const reason = window.prompt(
                                                        t('Reason for cancelling {reference}', {
                                                            reference: row.reference,
                                                        }),
                                                    );
                                                    if (reason?.trim())
                                                        void command(
                                                            () =>
                                                                transferApi.warehouseReasonCommand(
                                                                    row.id,
                                                                    'cancel',
                                                                    reason.trim(),
                                                                ),
                                                            t('{reference} cancelled.', { reference: row.reference }),
                                                        );
                                                }}
                                            />
                                        </>
                                    ) : null}
                                    {row.status === 'draft' && canDispatch ? (
                                        <IconButton
                                            icon="truck"
                                            label={t('Dispatch {reference}', { reference: row.reference })}
                                            requiresOnline
                                            onClick={() =>
                                                void command(
                                                    () => transferApi.warehouseCommand(row.id, 'dispatch'),
                                                    t('{reference} dispatched.', { reference: row.reference }),
                                                )
                                            }
                                            tone="primary"
                                        />
                                    ) : null}
                                    {row.status === 'dispatched' && canReceive ? (
                                        <IconButton
                                            icon="check"
                                            label={t('Receive {reference}', { reference: row.reference })}
                                            requiresOnline
                                            onClick={() =>
                                                void command(
                                                    () => transferApi.warehouseCommand(row.id, 'receive'),
                                                    t('{reference} received.', { reference: row.reference }),
                                                )
                                            }
                                            tone="primary"
                                        />
                                    ) : null}
                                    {['dispatched', 'received'].includes(row.status) && canReverse ? (
                                        <IconButton
                                            icon="reverse"
                                            label={t('Reverse {reference}', { reference: row.reference })}
                                            requiresOnline
                                            onClick={() => {
                                                const reason = window.prompt(
                                                    t('Reason for reversing {reference}', { reference: row.reference }),
                                                );
                                                if (reason?.trim())
                                                    void command(
                                                        () =>
                                                            transferApi.warehouseReasonCommand(
                                                                row.id,
                                                                'reverse',
                                                                reason.trim(),
                                                            ),
                                                        t('{reference} reversed.', { reference: row.reference }),
                                                    );
                                            }}
                                            tone="danger"
                                        />
                                    ) : null}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
function RepresentativeTable({
    canIssue,
    command,
    edit,
    requestReason,
    rows,
}: {
    canIssue: boolean;
    command: (operation: () => Promise<unknown>, message: string) => Promise<void>;
    edit: (row: RepresentativeTransfer) => void;
    requestReason: (row: RepresentativeTransfer, action: 'cancel' | 'reverse') => void;
    rows: RepresentativeTransfer[];
}) {
    const { formatDateTime, formatNumber, t } = useLocale();
    return (
        <div className="ui-table-wrap">
            <table className="ui-table transfer-table">
                <thead>
                    <tr>
                        <th>{t('Reference')}</th>
                        <th>{t('Representative')}</th>
                        <th>{t('Source')}</th>
                        <th>{t('Products / units')}</th>
                        <th>{t('Custody')}</th>
                        <th>{t('Status')}</th>
                        <th className="ui-table__actions">{t('Actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>
                                    <Link
                                        className="inventory-reference-link"
                                        to={`/admin/transfers/representative/${row.id}`}
                                    >
                                        {row.reference}
                                    </Link>
                                </strong>
                                <small>{row.created_at ? formatDateTime(row.created_at) : '—'}</small>
                            </td>
                            <td>
                                <span className="table-primary">{row.representative.name}</span>
                                <small>{row.representative.code}</small>
                            </td>
                            <td>
                                <span className="table-primary">{row.source_warehouse.name}</span>
                                <small>{row.source_warehouse.code}</small>
                            </td>
                            <td>
                                <strong>
                                    {formatNumber(row.items.length)} / {formatNumber(row.total_quantity)}
                                </strong>
                                <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.status === 'dispatched'
                                        ? t('Awaiting representative')
                                        : row.status === 'received'
                                          ? t('Representative stock')
                                          : row.status === 'reversed'
                                            ? t('Returned')
                                            : t('No stock effect')}
                                </span>
                                <small>{row.received_by?.name || row.notes || '—'}</small>
                            </td>
                            <td>
                                <StatusBadge tone={tone(row.status)}>{t(row.status)}</StatusBadge>
                            </td>
                            <td className="ui-table__actions">
                                <div className="row-actions">
                                    {row.status === 'draft' && canIssue ? (
                                        <>
                                            <IconButton
                                                icon="edit"
                                                label={t('Edit {name}', { name: row.reference })}
                                                onClick={() => edit(row)}
                                            />
                                            <IconButton
                                                icon="x"
                                                label={t('Cancel {reference}', { reference: row.reference })}
                                                requiresOnline
                                                onClick={() => requestReason(row, 'cancel')}
                                            />
                                            <IconButton
                                                icon="truck"
                                                label={t('Dispatch {reference}', { reference: row.reference })}
                                                requiresOnline
                                                onClick={() =>
                                                    void command(
                                                        () => transferApi.representativeCommand(row.id, 'dispatch'),
                                                        t('{reference} dispatched.', { reference: row.reference }),
                                                    )
                                                }
                                                tone="primary"
                                            />
                                        </>
                                    ) : null}
                                    {['dispatched', 'received'].includes(row.status) && canIssue ? (
                                        <IconButton
                                            icon="reverse"
                                            label={t('Reverse {reference}', { reference: row.reference })}
                                            requiresOnline
                                            onClick={() => requestReason(row, 'reverse')}
                                            tone="danger"
                                        />
                                    ) : null}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
function RepresentativeReturnTable({
    canReturn,
    command,
    edit,
    requestReason,
    rows,
}: {
    canReturn: boolean;
    command: (operation: () => Promise<unknown>, message: string) => Promise<void>;
    edit: (row: RepresentativeTransfer) => void;
    requestReason: (row: RepresentativeTransfer, action: 'cancel' | 'reverse') => void;
    rows: RepresentativeTransfer[];
}) {
    const { formatDateTime, formatNumber, t } = useLocale();
    return (
        <div className="ui-table-wrap">
            <table className="ui-table transfer-table">
                <thead>
                    <tr>
                        <th>{t('Reference')}</th>
                        <th>{t('Representative')}</th>
                        <th>{t('Target warehouse')}</th>
                        <th>{t('Products / units')}</th>
                        <th>{t('Custody')}</th>
                        <th>{t('Status')}</th>
                        <th className="ui-table__actions">{t('Actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>
                                    <Link
                                        className="inventory-reference-link"
                                        to={`/admin/transfers/representative-return/${row.id}`}
                                    >
                                        {row.reference}
                                    </Link>
                                </strong>
                                <small>{row.created_at ? formatDateTime(row.created_at) : '—'}</small>
                            </td>
                            <td>
                                <span className="table-primary">{row.representative.name}</span>
                                <small>{row.representative.code}</small>
                            </td>
                            <td>
                                <span className="table-primary">{row.source_warehouse.name}</span>
                                <small>{row.source_warehouse.code}</small>
                            </td>
                            <td>
                                <strong>
                                    {formatNumber(row.items.length)} / {formatNumber(row.total_quantity)}
                                </strong>
                                <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.status === 'received'
                                        ? t('Warehouse stock')
                                        : row.status === 'reversed'
                                          ? t('Representative stock')
                                          : t('No stock effect')}
                                </span>
                                <small>{row.received_by?.name || row.notes || '—'}</small>
                            </td>
                            <td>
                                <StatusBadge tone={tone(row.status)}>{t(row.status)}</StatusBadge>
                            </td>
                            <td className="ui-table__actions">
                                <div className="row-actions">
                                    {row.status === 'draft' && canReturn ? (
                                        <>
                                            <IconButton
                                                icon="edit"
                                                label={t('Edit {name}', { name: row.reference })}
                                                onClick={() => edit(row)}
                                            />
                                            <IconButton
                                                icon="x"
                                                label={t('Cancel {reference}', { reference: row.reference })}
                                                onClick={() => requestReason(row, 'cancel')}
                                                requiresOnline
                                            />
                                            <IconButton
                                                icon="check"
                                                label={t('Post {reference}', { reference: row.reference })}
                                                onClick={() =>
                                                    void command(
                                                        () => transferApi.representativeReturnCommand(row.id, 'post'),
                                                        t('{reference} posted.', { reference: row.reference }),
                                                    )
                                                }
                                                requiresOnline
                                                tone="primary"
                                            />
                                        </>
                                    ) : null}
                                    {row.status === 'received' && canReturn ? (
                                        <IconButton
                                            icon="reverse"
                                            label={t('Reverse {reference}', { reference: row.reference })}
                                            onClick={() => requestReason(row, 'reverse')}
                                            requiresOnline
                                            tone="danger"
                                        />
                                    ) : null}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
function StockTable({ rows }: { rows: RepresentativeInventory[] }) {
    const { formatDateTime, formatNumber, t } = useLocale();
    return (
        <div className="ui-table-wrap">
            <table className="ui-table">
                <thead>
                    <tr>
                        <th>{t('Representative')}</th>
                        <th>{t('Product')}</th>
                        <th className="is-numeric">{t('On hand')}</th>
                        <th className="is-numeric">{t('Incoming')}</th>
                        <th className="is-numeric">{t('Capacity left')}</th>
                        <th>{t('Updated')}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>{row.representative.name}</strong>
                                <small>{row.representative.code}</small>
                            </td>
                            <td>
                                <span className="table-primary">{row.product.name}</span>
                                <small>
                                    {row.product.sku} · {row.product.unit}
                                </small>
                            </td>
                            <td className="is-numeric">
                                <strong>{formatNumber(row.quantity)}</strong>
                            </td>
                            <td className="is-numeric">
                                <strong>{formatNumber(row.pending_quantity)}</strong>
                            </td>
                            <td className="is-numeric">
                                <strong>{formatNumber(row.foc_quantity)}</strong>
                                <small>{t('FOC base units')}</small>
                            </td>
                            <td>{row.updated_at ? formatDateTime(row.updated_at) : '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}
function Lines({
    errors,
    items,
    products,
    setItems,
    max = 4294967295,
}: {
    errors: Record<string, string[]>;
    items: { product_id: number; quantity: number }[];
    products: ProductOption[];
    setItems: (items: { product_id: number; quantity: number }[]) => void;
    max?: number;
}) {
    const { formatNumber, t } = useLocale();
    return (
        <div className="import-lines">
            <div className="import-lines__heading">
                <strong>{t('Products')}</strong>
                <Button
                    icon="plus"
                    onClick={() =>
                        setItems([
                            ...items,
                            {
                                product_id:
                                    products.find((product) => !items.some((item) => item.product_id === product.id))
                                        ?.id ?? 0,
                                quantity: 1,
                            },
                        ])
                    }
                >
                    {t('Add line')}
                </Button>
            </div>
            {items.map((item, index) => (
                <div className="import-line" key={index}>
                    <label className="ui-field">
                        <span>{t('Product {number}', { number: formatNumber(index + 1) })}</span>
                        <select
                            onChange={(event) =>
                                setItems(
                                    items.map((line, lineIndex) =>
                                        lineIndex === index
                                            ? {
                                                  ...line,
                                                  product_id: Number(event.target.value),
                                              }
                                            : line,
                                    ),
                                )
                            }
                            value={item.product_id}
                        >
                            <option value={0}>{t('Select product')}</option>
                            {products.map((product) => (
                                <option
                                    disabled={items.some(
                                        (line, lineIndex) => lineIndex !== index && line.product_id === product.id,
                                    )}
                                    key={product.id}
                                    value={product.id}
                                >
                                    {product.sku} · {product.name}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name={`items.${index}.product_id`} />
                    </label>
                    <label className="ui-field">
                        <span>{t('Quantity')}</span>
                        <input
                            max={max}
                            min={1}
                            onChange={(event) =>
                                setItems(
                                    items.map((line, lineIndex) =>
                                        lineIndex === index
                                            ? {
                                                  ...line,
                                                  quantity: editableNumber(event.target.value),
                                              }
                                            : line,
                                    ),
                                )
                            }
                            type="number"
                            value={item.quantity}
                        />
                        <FieldError errors={errors} name={`items.${index}.quantity`} />
                    </label>
                    <IconButton
                        disabled={items.length === 1}
                        icon="x"
                        label={t('Remove product {number}', { number: formatNumber(index + 1) })}
                        onClick={() => setItems(items.filter((_, lineIndex) => lineIndex !== index))}
                    />
                </div>
            ))}
        </div>
    );
}

export function WarehouseTransferFormPage() {
    const navigate = useNavigate();
    const { t } = useLocale();
    const { transferId } = useParams();
    const { user } = useSession();
    const [options, setOptions] = useState(emptyWarehouseOptions);
    const [transfer, setTransfer] = useState<WarehouseTransfer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([
            transferApi.warehouseOptions(),
            transferId ? transferApi.warehouseTransfer(Number(transferId)) : Promise.resolve(null),
        ])
            .then(([available, response]) => {
                if (!active) return;
                setOptions(available);
                setTransfer(response?.data ?? null);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [transferId, t]);

    return (
        <div className="admin-page stock-import-form-page warehouse-transfer-form-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Stock movement')}</p>
                    <h1>
                        {transfer ? t('Edit {name}', { name: transfer.reference }) : t('Create warehouse transfer')}
                    </h1>
                    <p>
                        {t('Build and review a stock-neutral transfer draft before dispatching it from the register.')}
                    </p>
                </div>
                <Button icon="chevronLeft" onClick={() => navigate('/admin/transfers')}>
                    {t('Back to transfers')}
                </Button>
            </header>
            {notice ? <div className="ui-flash ui-flash--success">{notice}</div> : null}
            {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
            {loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    {t('Loading transfer form…')}
                </div>
            ) : (
                <WarehouseTransferForm
                    canSubmit={Boolean(
                        user?.roles.includes('super-admin') ||
                        user?.permissions.includes('warehouse_transfer.dispatch'),
                    )}
                    onClose={() => navigate('/admin/transfers')}
                    onSaved={(_record, value) => {
                        setNotice(value);
                    }}
                    onSubmitted={() => navigate('/admin/transfers')}
                    options={options}
                    transfer={transfer}
                />
            )}
        </div>
    );
}

function WarehouseTransferForm({
    canSubmit,
    onClose,
    onSaved,
    onSubmitted,
    options,
    transfer,
}: {
    canSubmit: boolean;
    onClose: () => void;
    onSaved: (record: WarehouseTransfer, message: string) => void;
    onSubmitted: () => void;
    options: WarehouseTransferOptions;
    transfer: WarehouseTransfer | null;
}) {
    const { formatNumber, t } = useLocale();
    const [step, setStep] = useState(1);
    const [draftRecord, setDraftRecord] = useState<WarehouseTransfer | null>(transfer);
    const [form, setForm] = useState<WarehouseTransferInput>({
        destination_warehouse_id: 0,
        items: [{ product_id: 0, product_unit_id: 0, quantity: 1 }],
        notes: '',
        source_warehouse_id: 0,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setStep(1);
        setDraftRecord(transfer);
        setErrors({});
        setForm(
            transfer
                ? {
                      source_warehouse_id: transfer.source_warehouse.id,
                      destination_warehouse_id: transfer.destination_warehouse.id,
                      notes: transfer.notes ?? '',
                      items: transfer.items.map((item) => ({
                          product_id: item.product.id,
                          product_unit_id:
                              item.unit?.id ??
                              options.products
                                  .find((product) => product.id === item.product.id)
                                  ?.units?.find((unit) => unit.is_base)?.id ??
                              0,
                          quantity: item.quantity,
                      })),
                  }
                : {
                      source_warehouse_id: options.source_warehouses[0]?.id ?? 0,
                      destination_warehouse_id:
                          options.destination_warehouses.find(
                              (warehouse) => warehouse.id !== options.source_warehouses[0]?.id,
                          )?.id ?? 0,
                      notes: '',
                      items: [],
                  },
        );
    }, [options.destination_warehouses, options.products, options.source_warehouses, transfer]);
    const destinationWarehouses = options.destination_warehouses.filter(
        (warehouse) => warehouse.id !== form.source_warehouse_id,
    );
    const next = () => {
        const nextErrors: Record<string, string[]> = {};
        if (step === 1) {
            const sourceId = form.source_warehouse_id || options.source_warehouses[0]?.id || 0;
            const destinationId =
                form.destination_warehouse_id ||
                options.destination_warehouses.find((warehouse) => warehouse.id !== sourceId)?.id ||
                0;
            if (!sourceId) nextErrors.source_warehouse_id = [t('Select a source warehouse.')];
            if (!destinationId) nextErrors.destination_warehouse_id = [t('Select a destination warehouse.')];
            if (sourceId === destinationId)
                nextErrors.destination_warehouse_id = [t('Destination must differ from the source warehouse.')];
            if (!Object.keys(nextErrors).length) {
                setForm((value) => ({
                    ...value,
                    destination_warehouse_id: destinationId,
                    source_warehouse_id: sourceId,
                }));
            }
        }
        if (step === 2 && form.items.length === 0) nextErrors.items = [t('Select at least one product.')];
        if (step === 3) {
            form.items.forEach((item, index) => {
                if (!item.product_unit_id) nextErrors[`items.${index}.product_unit_id`] = [t('Select a product unit.')];
                if (!Number.isInteger(item.quantity) || item.quantity < 1)
                    nextErrors[`items.${index}.quantity`] = [t('Enter a whole quantity of at least one.')];
            });
        }
        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return;
        }
        setErrors({});
        setStep((value) => Math.min(4, value + 1));
    };
    const saveDraft = async () => {
        setSaving(true);
        setErrors({});
        try {
            const response = draftRecord
                ? await transferApi.updateWarehouseTransfer(draftRecord.id, form)
                : await transferApi.createWarehouseTransfer(form);
            setDraftRecord(response.data);
            onSaved(
                response.data,
                t(draftRecord ? 'Warehouse transfer draft updated.' : 'Warehouse transfer draft created.'),
            );
            return response.data;
        } catch (requestError) {
            if (requestError instanceof TransferApiError) setErrors(requestError.fields);
            setErrors((value) => ({ ...value, form: [message(requestError, t('Unable to complete the request.'))] }));
            return null;
        } finally {
            setSaving(false);
        }
    };
    const submitTransfer = async () => {
        const record = await saveDraft();
        if (!record || !canSubmit) return;
        setSaving(true);
        try {
            await transferApi.warehouseCommand(record.id, 'dispatch');
            onSubmitted();
        } catch (requestError) {
            setErrors({ form: [message(requestError, t('Unable to complete the request.'))] });
        } finally {
            setSaving(false);
        }
    };
    return (
        <section className="stock-import-form-page__panel warehouse-transfer-form-page__panel">
            <form className="management-form" id="warehouse-transfer-form" onSubmit={(event) => event.preventDefault()}>
                <ol aria-label={t('Warehouse transfer progress')} className="form-stepper transfer-form-stepper">
                    {['Transfer information', 'Product selection', 'Unit & quantity', 'Review & save'].map(
                        (label, index) => (
                            <li
                                aria-current={step === index + 1 ? 'step' : undefined}
                                className={step >= index + 1 ? 'is-active' : ''}
                                key={label}
                            >
                                <span>{formatNumber(index + 1)}</span>
                                <strong>{t(label)}</strong>
                            </li>
                        ),
                    )}
                </ol>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                {step === 1 ? (
                    <div className="form-grid transfer-wizard-section">
                        <label className="ui-field">
                            <span>{t('Source warehouse')}</span>
                            <select
                                onChange={(event) => {
                                    const sourceWarehouseId = Number(event.target.value);
                                    setForm((value) => {
                                        const destinationIsValid = options.destination_warehouses.some(
                                            (warehouse) =>
                                                warehouse.id === value.destination_warehouse_id &&
                                                warehouse.id !== sourceWarehouseId,
                                        );

                                        return {
                                            ...value,
                                            source_warehouse_id: sourceWarehouseId,
                                            destination_warehouse_id: destinationIsValid
                                                ? value.destination_warehouse_id
                                                : (options.destination_warehouses.find(
                                                      (warehouse) => warehouse.id !== sourceWarehouseId,
                                                  )?.id ?? 0),
                                        };
                                    });
                                }}
                                value={form.source_warehouse_id}
                            >
                                {options.source_warehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                        {warehouse.code} · {warehouse.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={errors} name="source_warehouse_id" />
                        </label>
                        <label className="ui-field">
                            <span>{t('Destination warehouse')}</span>
                            <select
                                disabled={destinationWarehouses.length === 0}
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        destination_warehouse_id: Number(event.target.value),
                                    }))
                                }
                                value={form.destination_warehouse_id}
                            >
                                {destinationWarehouses.length === 0 ? (
                                    <option value={0}>{t('No destination warehouse available')}</option>
                                ) : null}
                                {destinationWarehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                        {warehouse.code} · {warehouse.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={errors} name="destination_warehouse_id" />
                        </label>
                        <label className="ui-field form-grid__wide">
                            <span>{t('Notes')}</span>
                            <input
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        notes: event.target.value,
                                    }))
                                }
                                value={form.notes}
                            />
                        </label>
                    </div>
                ) : null}

                {step === 2 ? (
                    <div className="stock-import-products transfer-wizard-section">
                        <div className="import-lines__heading">
                            <strong>{t('Select products')}</strong>
                            <small>{t('{count} selected', { count: formatNumber(form.items.length) })}</small>
                        </div>
                        <div className="stock-import-products__list">
                            {options.products.map((product) => {
                                const selected = form.items.some((item) => item.product_id === product.id);
                                return (
                                    <label
                                        className={`stock-import-product ${selected ? 'is-selected' : ''}`}
                                        key={product.id}
                                    >
                                        <input
                                            aria-label={t('Select {name}', { name: product.name })}
                                            checked={selected}
                                            onChange={() =>
                                                setForm((value) => ({
                                                    ...value,
                                                    items: selected
                                                        ? value.items.filter((item) => item.product_id !== product.id)
                                                        : [
                                                              ...value.items,
                                                              {
                                                                  product_id: product.id,
                                                                  product_unit_id:
                                                                      product.units?.find(
                                                                          (unit) => unit.is_default_selling,
                                                                      )?.id ??
                                                                      product.units?.find((unit) => unit.is_base)?.id ??
                                                                      product.units?.[0]?.id ??
                                                                      0,
                                                                  quantity: 1,
                                                              },
                                                          ],
                                                }))
                                            }
                                            type="checkbox"
                                        />
                                        <span>
                                            <strong>{product.name}</strong>
                                            <small>
                                                {product.sku} · {product.unit}
                                            </small>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}

                {step === 3 ? (
                    <div className="transfer-wizard-section">
                        <div className="import-lines__heading">
                            <strong>{t('Set units and quantities')}</strong>
                            <small>{t('Choose the package unit used for each transfer line.')}</small>
                        </div>
                        <div className="transfer-wizard-quantities">
                            {form.items.map((item, index) => {
                                const product = options.products.find((option) => option.id === item.product_id);
                                const baseUnit = product?.units?.find((unit) => unit.is_base);
                                return (
                                    <div className="import-line import-line--quantity" key={item.product_id}>
                                        <div>
                                            <strong>{product?.name}</strong>
                                            <small>{product?.sku}</small>
                                        </div>
                                        <label className="ui-field">
                                            <span>{t('Unit')}</span>
                                            <select
                                                onChange={(event) =>
                                                    setForm((value) => ({
                                                        ...value,
                                                        items: value.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      product_unit_id: Number(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    }))
                                                }
                                                required
                                                value={item.product_unit_id || ''}
                                            >
                                                <option disabled value="">
                                                    {t('Select unit')}
                                                </option>
                                                {(product?.units ?? []).map((unit) => (
                                                    <option key={unit.id} value={unit.id}>
                                                        {unit.name}
                                                        {unit.is_base
                                                            ? ` (${t('base unit')})`
                                                            : ` (${formatNumber(unit.conversion_factor)} ${baseUnit?.name ?? t('base units')})`}
                                                    </option>
                                                ))}
                                            </select>
                                            <FieldError errors={errors} name={`items.${index}.product_unit_id`} />
                                        </label>
                                        <label className="ui-field">
                                            <span>{t('Transfer quantity')}</span>
                                            <input
                                                min={1}
                                                onChange={(event) =>
                                                    setForm((value) => ({
                                                        ...value,
                                                        items: value.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      quantity: editableNumber(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    }))
                                                }
                                                required
                                                type="number"
                                                value={item.quantity}
                                            />
                                            <FieldError errors={errors} name={`items.${index}.quantity`} />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}

                {step === 4 ? (
                    <div className="transfer-wizard-section transfer-wizard-review">
                        <section>
                            <span>{t('Source')}</span>
                            <strong>
                                {
                                    options.source_warehouses.find(
                                        (warehouse) => warehouse.id === form.source_warehouse_id,
                                    )?.name
                                }
                            </strong>
                        </section>
                        <section>
                            <span>{t('Destination')}</span>
                            <strong>
                                {
                                    options.destination_warehouses.find(
                                        (warehouse) => warehouse.id === form.destination_warehouse_id,
                                    )?.name
                                }
                            </strong>
                        </section>
                        <section>
                            <span>{t('Products')}</span>
                            <strong>{formatNumber(form.items.length)}</strong>
                        </section>
                        <section>
                            <span>{t('Total base units')}</span>
                            <strong>
                                {formatNumber(
                                    form.items.reduce((total, item) => {
                                        const product = options.products.find(
                                            (option) => option.id === item.product_id,
                                        );
                                        const unit = product?.units?.find(
                                            (option) => option.id === item.product_unit_id,
                                        );
                                        return total + item.quantity * (unit?.conversion_factor ?? 0);
                                    }, 0),
                                )}
                            </strong>
                        </section>
                        <div className="ui-table-wrap">
                            <table className="ui-table transfer-wizard-review__table">
                                <thead>
                                    <tr>
                                        <th>{t('Product')}</th>
                                        <th>{t('Unit')}</th>
                                        <th className="is-numeric">{t('Quantity')}</th>
                                        <th className="is-numeric">{t('Base stock')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((item) => {
                                        const product = options.products.find(
                                            (option) => option.id === item.product_id,
                                        );
                                        const unit = product?.units?.find(
                                            (option) => option.id === item.product_unit_id,
                                        );
                                        return (
                                            <tr key={item.product_id}>
                                                <td>
                                                    <strong>{product?.name}</strong>
                                                    <small>
                                                        {t('{sku} · Base unit: {unit}', {
                                                            sku: product?.sku ?? '',
                                                            unit:
                                                                product?.units?.find((option) => option.is_base)
                                                                    ?.name ??
                                                                product?.unit ??
                                                                '',
                                                        })}
                                                    </small>
                                                </td>
                                                <td>
                                                    <strong>{unit?.name ?? t('Not selected')}</strong>
                                                    <small>
                                                        {t('{count} base units each', {
                                                            count: formatNumber(unit?.conversion_factor ?? 0),
                                                        })}
                                                    </small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{formatNumber(item.quantity)}</strong>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>
                                                        {formatNumber(item.quantity * (unit?.conversion_factor ?? 0))}
                                                    </strong>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {form.notes ? (
                            <p className="transfer-wizard-review__notes">
                                <strong>{t('Notes:')}</strong> {form.notes}
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </form>
            <footer className="stock-import-form-page__actions">
                {step === 1 ? (
                    <Button onClick={onClose}>{t('Cancel')}</Button>
                ) : (
                    <Button onClick={() => setStep((value) => value - 1)}>{t('Back')}</Button>
                )}
                {step === 3 ? (
                    <Button disabled={saving} onClick={() => void saveDraft()} requiresOnline>
                        {saving ? t('Saving…') : t('Save draft')}
                    </Button>
                ) : null}
                {step < 4 ? (
                    <Button onClick={next} tone="primary" type="button">
                        {t('Continue')}
                    </Button>
                ) : (
                    <Button
                        disabled={saving}
                        onClick={() => void submitTransfer()}
                        requiresOnline
                        tone="primary"
                        type="button"
                    >
                        {saving ? t('Submitting…') : t(canSubmit ? 'Submit transfer' : 'Save draft')}
                    </Button>
                )}
            </footer>
        </section>
    );
}
export function RepresentativeTransferFormPage() {
    const navigate = useNavigate();
    const { t } = useLocale();
    const { transferId } = useParams();
    const [searchParams] = useSearchParams();
    const tripId = Number(searchParams.get('tripId') ?? 0);
    const tripWarehouseId = Number(searchParams.get('warehouseId') ?? 0);
    const tripRepresentativeId = Number(searchParams.get('representativeId') ?? 0);
    const [options, setOptions] = useState(emptyRepresentativeOptions);
    const [transfer, setTransfer] = useState<RepresentativeTransfer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([
            transferApi.representativeOptions(),
            transferId ? transferApi.representativeTransfer(Number(transferId)) : Promise.resolve(null),
        ])
            .then(([available, response]) => {
                if (!active) return;
                setOptions(available);
                setTransfer(response?.data ?? null);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [transferId, t]);

    return (
        <div className="admin-page stock-import-form-page representative-transfer-form-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Representative stock')}</p>
                    <h1>
                        {transfer ? t('Edit {name}', { name: transfer.reference }) : t('Create representative issue')}
                    </h1>
                    <p>{t('Build and review a controlled stock issue before dispatching it to the representative.')}</p>
                </div>
                <Button icon="chevronLeft" onClick={() => navigate(tripId ? `/admin/trips/${tripId}` : '/admin/transfers')}>
                    {t(tripId ? 'Back to trip' : 'Back to transfers')}
                </Button>
            </header>
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    {error}
                </div>
            ) : null}
            {loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    {t('Loading representative issue form…')}
                </div>
            ) : (
                <RepresentativeTransferWizard
                    onClose={() => navigate(tripId ? `/admin/trips/${tripId}` : '/admin/transfers')}
                    onSubmitted={(record) => navigate(tripId ? `/admin/trips/${tripId}` : `/admin/transfers/representative/${record.id}`)}
                    options={options}
                    preset={{ tripId, warehouseId: tripWarehouseId, representativeId: tripRepresentativeId }}
                    transfer={transfer}
                />
            )}
        </div>
    );
}

function RepresentativeTransferWizard({
    onClose,
    onSubmitted,
    options,
    preset,
    transfer,
}: {
    onClose: () => void;
    onSubmitted: (record: RepresentativeTransfer) => void;
    options: RepresentativeTransferOptions;
    preset: { tripId: number; warehouseId: number; representativeId: number };
    transfer: RepresentativeTransfer | null;
}) {
    const { formatNumber, t } = useLocale();
    const [step, setStep] = useState(1);
    const [draftRecord, setDraftRecord] = useState(transfer);
    const [form, setForm] = useState<RepresentativeTransferInput>({
        trip_id: transfer?.trip?.id ?? preset.tripId,
        items: [],
        notes: '',
        sales_representative_id: options.representatives[0]?.id ?? 0,
        source_warehouse_id: options.source_warehouses[0]?.id ?? 0,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const filteredRepresentatives = useMemo(
        () =>
            options.representatives.filter(
                (representative) => representative.primary_warehouse_id === form.source_warehouse_id,
            ),
        [form.source_warehouse_id, options.representatives],
    );
    useEffect(() => {
        const sourceWarehouseId = transfer?.source_warehouse.id ?? (preset.warehouseId || options.source_warehouses[0]?.id || 0);
        const representativeId =
            transfer?.representative.id ??
            (preset.representativeId ||
                options.representatives.find((value) => value.primary_warehouse_id === sourceWarehouseId)?.id ||
                0);
        setStep(1);
        setDraftRecord(transfer);
        setErrors({});
        setForm(
            transfer
                ? {
                      trip_id: transfer.trip?.id ?? preset.tripId,
                      source_warehouse_id: transfer.source_warehouse.id,
                      sales_representative_id: transfer.representative.id,
                      notes: transfer.notes ?? '',
                      items: transfer.items.map((item) => ({
                          product_id: item.product.id,
                          product_unit_id: item.unit?.id,
                          quantity: item.quantity,
                          foc_product_unit_id: item.foc_unit?.id,
                          foc_quantity: item.foc_quantity ?? 0,
                      })),
                  }
                : {
                      trip_id: preset.tripId,
                      source_warehouse_id: sourceWarehouseId,
                      sales_representative_id: representativeId,
                      notes: '',
                      items: [],
                  },
        );
    }, [options, preset.representativeId, preset.tripId, preset.warehouseId, transfer]);

    const next = () => {
        const nextErrors: Record<string, string[]> = {};
        if (step === 1 && (!form.trip_id || !form.sales_representative_id || !form.source_warehouse_id))
            nextErrors.form = [t('This stock issue must be opened from a valid trip.')];
        if (step === 1 && !form.items.length) nextErrors.items = [t('Select at least one product.')];
        if (
            step === 2 &&
            form.items.some(
                (item) =>
                    !Number.isInteger(item.quantity) ||
                    item.quantity < 1 ||
                    !Number.isInteger(item.foc_quantity ?? 0) ||
                    (item.foc_quantity ?? 0) < 0,
            )
        )
            nextErrors.items = [
                t('Paid quantities must be whole numbers of at least 1; FOC must be a whole number of 0 or more.'),
            ];
        if (
            step === 2 &&
            form.items.some((item) => {
                const product = options.products.find((value) => value.id === item.product_id);
                const unit =
                    product?.units?.find((unit) => unit.id === item.product_unit_id) ??
                    product?.units?.find((unit) => unit.is_default_selling) ??
                    product?.units?.[0];
                const focUnit = product?.units?.find((unit) => unit.id === item.foc_product_unit_id) ?? unit;
                return (
                    item.quantity * (unit?.conversion_factor ?? 1) +
                        (item.foc_quantity ?? 0) * (focUnit?.conversion_factor ?? 1) >
                    (product?.warehouse_stock?.[String(form.source_warehouse_id)] ?? 0)
                );
            })
        )
            nextErrors.items = [t('One or more quantities exceed the available warehouse stock.')];
        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return;
        }
        setErrors({});
        setStep((value) => Math.min(3, value + 1));
    };
    const saveDraft = async () => {
        setSaving(true);
        setErrors({});
        try {
            const response = draftRecord
                ? await transferApi.updateRepresentativeTransfer(draftRecord.id, form)
                : await transferApi.createRepresentativeTransfer(form);
            setDraftRecord(response.data);
            return response.data;
        } catch (requestError) {
            if (requestError instanceof TransferApiError) setErrors(requestError.fields);
            setErrors((value) => ({ ...value, form: [message(requestError, t('Unable to complete the request.'))] }));
            return null;
        } finally {
            setSaving(false);
        }
    };
    const submit = async () => {
        const record = await saveDraft();
        if (!record) return;
        setSaving(true);
        try {
            const response = await transferApi.representativeCommand(record.id, 'dispatch');
            onSubmitted(response.data);
        } catch (requestError) {
            setErrors({ form: [message(requestError, t('Unable to complete the request.'))] });
        } finally {
            setSaving(false);
        }
    };
    const representative = options.representatives.find((value) => value.id === form.sales_representative_id);
    const sourceWarehouse = options.source_warehouses.find((value) => value.id === form.source_warehouse_id);
    return (
        <section className="stock-import-form-page__panel warehouse-transfer-form-page__panel">
            <form className="management-form" onSubmit={(event) => event.preventDefault()}>
                <div className="trip-linked-transfer-context" aria-label={t('Trip stock issue assignment')}>
                    <div>
                        <span>{t('Source warehouse')}</span>
                        <strong>{sourceWarehouse ? `${sourceWarehouse.code} · ${sourceWarehouse.name}` : t('Not available')}</strong>
                    </div>
                    <div>
                        <span>{t('Representative')}</span>
                        <strong>{representative ? `${representative.code} · ${representative.name}` : t('Not available')}</strong>
                    </div>
                    <p>{t('Assignment comes from the selected trip and cannot be changed here.')}</p>
                </div>
                <ol aria-label={t('Representative issue progress')} className="form-stepper transfer-form-stepper">
                    {['Product selection', 'Quantity', 'Review & dispatch'].map((label, index) => (
                        <li
                            aria-current={step === index + 1 ? 'step' : undefined}
                            className={step >= index + 1 ? 'is-active' : ''}
                            key={label}
                        >
                            <span>{formatNumber(index + 1)}</span>
                            <strong>{t(label)}</strong>
                        </li>
                    ))}
                </ol>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                {false ? (
                    <div className="form-grid transfer-wizard-section">
                        <label className="ui-field representative-select-field">
                            <span>{t('Representative')}</span>
                            <select
                                onChange={(event) => {
                                    const id = Number(event.target.value);
                                    setForm((value) => ({
                                        ...value,
                                        sales_representative_id: id,
                                    }));
                                }}
                                value={form.sales_representative_id}
                            >
                                <option value={0}>
                                    {filteredRepresentatives.length
                                        ? t('Select representative')
                                        : t('No representatives in warehouse')}
                                </option>
                                {filteredRepresentatives.map((value) => (
                                    <option key={value.id} value={value.id}>
                                        {value.code} · {value.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={errors} name="sales_representative_id" />
                        </label>
                        <label className="ui-field representative-warehouse-field">
                            <span>{t('Source warehouse')}</span>
                            <select
                                onChange={(event) => {
                                    const warehouseId = Number(event.target.value);
                                    const firstRepresentative = options.representatives.find(
                                        (value) => value.primary_warehouse_id === warehouseId,
                                    );
                                    setForm((value) => ({
                                        ...value,
                                        source_warehouse_id: warehouseId,
                                        sales_representative_id: firstRepresentative?.id ?? 0,
                                    }));
                                }}
                                value={form.source_warehouse_id}
                            >
                                {options.source_warehouses.map((value) => (
                                    <option key={value.id} value={value.id}>
                                        {value.code} · {value.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={errors} name="source_warehouse_id" />
                        </label>
                        <label className="ui-field form-grid__wide">
                            <span>{t('Notes')}</span>
                            <textarea
                                maxLength={2000}
                                onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
                                rows={3}
                                value={form.notes}
                            />
                        </label>
                    </div>
                ) : null}
                {step === 1 ? (
                    <div className="stock-import-products transfer-wizard-section">
                        <div className="import-lines__heading">
                            <strong>{t('Select products')}</strong>
                            <small>{t('{count} selected', { count: formatNumber(form.items.length) })}</small>
                        </div>
                        <div className="stock-import-products__list">
                            {options.products.map((product) => {
                                const selected = form.items.some((item) => item.product_id === product.id);
                                return (
                                    <label
                                        className={`stock-import-product ${selected ? 'is-selected' : ''}`}
                                        key={product.id}
                                    >
                                        <input
                                            aria-label={t('Select {name}', { name: product.name })}
                                            checked={selected}
                                            onChange={() =>
                                                setForm((value) => ({
                                                    ...value,
                                                    items: selected
                                                        ? value.items.filter((item) => item.product_id !== product.id)
                                                        : [...value.items, { product_id: product.id, quantity: 1 }],
                                                }))
                                            }
                                            type="checkbox"
                                        />
                                        <span>
                                            <strong>{product.name}</strong>
                                            <small>
                                                {product.sku} · {product.unit}
                                            </small>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}
                {step === 2 ? (
                    <div className="transfer-wizard-section">
                        <div className="import-lines__heading">
                            <strong>{t('Set issue quantities')}</strong>
                            <small>
                                {t(
                                    'Paid and FOC stock are tracked separately; all quantities are converted to base units.',
                                )}
                            </small>
                        </div>
                        <div className="transfer-wizard-quantities">
                            {form.items.map((item, index) => {
                                const product = options.products.find((value) => value.id === item.product_id);
                                const available = product?.warehouse_stock?.[String(form.source_warehouse_id)] ?? 0;
                                const unit =
                                    product?.units?.find((unit) => unit.id === item.product_unit_id) ??
                                    product?.units?.find((unit) => unit.is_default_selling) ??
                                    product?.units?.[0];
                                const focUnit =
                                    product?.units?.find((unit) => unit.id === item.foc_product_unit_id) ?? unit;
                                const physical =
                                    item.quantity * (unit?.conversion_factor ?? 1) +
                                    (item.foc_quantity ?? 0) * (focUnit?.conversion_factor ?? 1);
                                const exceedsStock = physical > available;
                                return (
                                    <div
                                        className={`import-line import-line--quantity transfer-quantity-line ${exceedsStock ? 'is-invalid' : ''}`}
                                        key={item.product_id}
                                    >
                                        <div className="transfer-quantity-line__product">
                                            <strong>{product?.name}</strong>
                                            <small
                                                className={
                                                    exceedsStock ? 'stock-availability is-danger' : 'stock-availability'
                                                }
                                            >
                                                {t('Available: {count} base units', { count: formatNumber(available) })}
                                            </small>
                                            <small>
                                                {product?.sku} · {product?.unit}
                                            </small>
                                        </div>
                                        <label className="ui-field transfer-quantity-line__paid-unit">
                                            <span>{t('Issue unit')}</span>
                                            <select
                                                aria-label={t('Issue unit')}
                                                onChange={(event) =>
                                                    setForm((value) => ({
                                                        ...value,
                                                        items: value.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      product_unit_id: Number(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    }))
                                                }
                                                value={unit?.id}
                                            >
                                                {product?.units?.map((option) => (
                                                    <option key={option.id} value={option.id}>
                                                        {option.name} ({formatNumber(option.conversion_factor)}{' '}
                                                        {t('base')})
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="ui-field transfer-quantity-line__paid-quantity">
                                            <span>{t('Paid stock quantity')}</span>
                                            <input
                                                aria-label={t('Paid stock quantity')}
                                                aria-invalid={exceedsStock}
                                                min={1}
                                                onChange={(event) =>
                                                    setForm((value) => ({
                                                        ...value,
                                                        items: value.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      quantity: editableNumber(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    }))
                                                }
                                                required
                                                type="number"
                                                value={item.quantity}
                                            />
                                            {exceedsStock ? (
                                                <small className="ui-field-error">
                                                    {t('Only {count} {unit} available.', {
                                                        count: formatNumber(available),
                                                        unit: product?.unit ?? '',
                                                    })}
                                                </small>
                                            ) : null}
                                        </label>
                                        <label className="ui-field transfer-quantity-line__foc-unit">
                                            <span>{t('FOC unit')}</span>
                                            <select
                                                aria-label={t('FOC unit')}
                                                onChange={(event) =>
                                                    setForm((value) => ({
                                                        ...value,
                                                        items: value.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      foc_product_unit_id: Number(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    }))
                                                }
                                                value={focUnit?.id}
                                            >
                                                {product?.units?.map((option) => (
                                                    <option key={option.id} value={option.id}>
                                                        {option.name} ({formatNumber(option.conversion_factor)}{' '}
                                                        {t('base')})
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="ui-field transfer-quantity-line__foc-quantity">
                                            <span>{t('FOC quantity')}</span>
                                            <input
                                                aria-label={t('FOC quantity')}
                                                min={0}
                                                onChange={(event) =>
                                                    setForm((value) => ({
                                                        ...value,
                                                        items: value.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      foc_quantity: editableNumber(event.target.value),
                                                                      foc_product_unit_id:
                                                                          line.foc_product_unit_id ?? focUnit?.id,
                                                                  }
                                                                : line,
                                                        ),
                                                    }))
                                                }
                                                type="number"
                                                value={item.foc_quantity ?? 0}
                                            />
                                        </label>
                                        <strong className="transfer-base-total">
                                            {t('{count} base units total', { count: formatNumber(physical) })}
                                        </strong>
                                    </div>
                                );
                            })}
                        </div>
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}
                {step === 3 ? (
                    <div className="transfer-wizard-section transfer-wizard-review">
                        <section>
                            <span>{t('Representative')}</span>
                            <strong>{representative?.name}</strong>
                        </section>
                        <section>
                            <span>{t('Source')}</span>
                            <strong>
                                {options.source_warehouses.find((value) => value.id === form.source_warehouse_id)?.name}
                            </strong>
                        </section>
                        <section>
                            <span>{t('Products')}</span>
                            <strong>{formatNumber(form.items.length)}</strong>
                        </section>
                        <section>
                            <span>{t('Paid / FOC base')}</span>
                            <strong>
                                {formatNumber(
                                    form.items.reduce((sum, item) => {
                                        const product = options.products.find((value) => value.id === item.product_id);
                                        const unit =
                                            product?.units?.find((value) => value.id === item.product_unit_id) ??
                                            product?.units?.find((value) => value.is_default_selling) ??
                                            product?.units?.[0];
                                        return sum + item.quantity * (unit?.conversion_factor ?? 1);
                                    }, 0),
                                )}{' '}
                                /{' '}
                                {formatNumber(
                                    form.items.reduce((sum, item) => {
                                        const product = options.products.find((value) => value.id === item.product_id);
                                        const unit =
                                            product?.units?.find((value) => value.id === item.foc_product_unit_id) ??
                                            product?.units?.find((value) => value.id === item.product_unit_id) ??
                                            product?.units?.find((value) => value.is_default_selling) ??
                                            product?.units?.[0];
                                        return sum + (item.foc_quantity ?? 0) * (unit?.conversion_factor ?? 1);
                                    }, 0),
                                )}
                            </strong>
                        </section>
                        <div className="ui-table-wrap">
                            <table className="ui-table transfer-wizard-review__table">
                                <thead>
                                    <tr>
                                        <th>{t('Product')}</th>
                                        <th className="is-numeric">{t('Paid')}</th>
                                        <th className="is-numeric">{t('FOC')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((item) => {
                                        const product = options.products.find((value) => value.id === item.product_id);
                                        const paidUnit =
                                            product?.units?.find((unit) => unit.id === item.product_unit_id) ??
                                            product?.units?.find((unit) => unit.is_default_selling) ??
                                            product?.units?.[0];
                                        const focUnit =
                                            product?.units?.find((unit) => unit.id === item.foc_product_unit_id) ??
                                            paidUnit;
                                        return (
                                            <tr key={item.product_id}>
                                                <td>
                                                    <strong>{product?.name}</strong>
                                                    <small>{product?.sku}</small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{formatNumber(item.quantity)}</strong>
                                                    <small>
                                                        {paidUnit?.name ?? product?.unit} ·{' '}
                                                        {formatNumber(
                                                            item.quantity * (paidUnit?.conversion_factor ?? 1),
                                                        )}{' '}
                                                        {t('base')}
                                                    </small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{formatNumber(item.foc_quantity ?? 0)}</strong>
                                                    <small>
                                                        {focUnit?.name ?? product?.unit} ·{' '}
                                                        {formatNumber(
                                                            (item.foc_quantity ?? 0) *
                                                                (focUnit?.conversion_factor ?? 1),
                                                        )}{' '}
                                                        {t('base')}
                                                    </small>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {form.notes ? (
                            <p className="transfer-wizard-review__notes">
                                <strong>{t('Notes:')}</strong> {form.notes}
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </form>
            <footer className="stock-import-form-page__actions">
                {step === 1 ? (
                    <Button onClick={onClose}>{t('Cancel')}</Button>
                ) : (
                    <Button onClick={() => setStep((value) => value - 1)}>{t('Back')}</Button>
                )}
                {step === 2 ? (
                    <Button disabled={saving} onClick={() => void saveDraft()} requiresOnline>
                        {saving ? t('Saving…') : t('Save draft')}
                    </Button>
                ) : null}
                {step < 3 ? (
                    <Button onClick={next} tone="primary">
                        {t('Continue')}
                    </Button>
                ) : (
                    <Button disabled={saving} onClick={() => void submit()} requiresOnline tone="primary">
                        {saving ? t('Dispatching…') : t('Save & dispatch')}
                    </Button>
                )}
            </footer>
        </section>
    );
}

export function RepresentativeTransferDialog({
    onClose,
    onSaved,
    open,
    options,
    transfer,
}: {
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: RepresentativeTransferOptions;
    transfer: RepresentativeTransfer | null;
}) {
    const { t } = useLocale();
    const [form, setForm] = useState<RepresentativeTransferInput>({
        trip_id: 0,
        items: [{ product_id: 0, quantity: 1 }],
        notes: '',
        sales_representative_id: 0,
        source_warehouse_id: 0,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setErrors({});
        setForm(
            transfer
                ? {
                      trip_id: transfer.trip?.id ?? 0,
                      source_warehouse_id: transfer.source_warehouse.id,
                      sales_representative_id: transfer.representative.id,
                      notes: transfer.notes ?? '',
                      items: transfer.items.map((item) => ({
                          product_id: item.product.id,
                          quantity: item.quantity,
                      })),
                  }
                : {
                      trip_id: 0,
                      source_warehouse_id: options.source_warehouses[0]?.id ?? 0,
                      sales_representative_id: options.representatives[0]?.id ?? 0,
                      notes: '',
                      items: [
                          {
                              product_id: options.products[0]?.id ?? 0,
                              quantity: 1,
                          },
                      ],
                  },
        );
    }, [open, options, transfer]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            if (transfer) await transferApi.updateRepresentativeTransfer(transfer.id, form);
            else await transferApi.createRepresentativeTransfer(form);
            await onSaved(t(transfer ? 'Representative issue draft updated.' : 'Representative issue draft created.'));
        } catch (requestError) {
            if (requestError instanceof TransferApiError) setErrors(requestError.fields);
            setErrors((value) => ({ ...value, form: [message(requestError, t('Unable to complete the request.'))] }));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            description={t(
                'Dispatch validates warehouse stock, converts selected units to base stock, and keeps paid and FOC balances separate.',
            )}
            footer={
                <>
                    <Button onClick={onClose}>{t('Cancel')}</Button>
                    <Button
                        disabled={saving}
                        form="representative-transfer-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? t('Saving…') : t('Save draft')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={
                transfer
                    ? t('Edit issue · {reference}', { reference: transfer.reference })
                    : t('Create representative issue')
            }
            width="wide"
        >
            <form className="management-form" id="representative-transfer-form" onSubmit={submit}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>{t('Source warehouse')}</span>
                        <select
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    source_warehouse_id: Number(event.target.value),
                                }))
                            }
                            value={form.source_warehouse_id}
                        >
                            {options.source_warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.code} · {warehouse.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="ui-field">
                        <span>{t('Representative')}</span>
                        <select
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    sales_representative_id: Number(event.target.value),
                                }))
                            }
                            value={form.sales_representative_id}
                        >
                            {options.representatives.map((representative) => (
                                <option key={representative.id} value={representative.id}>
                                    {representative.code} · {representative.name}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="sales_representative_id" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Notes')}</span>
                        <input
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    notes: event.target.value,
                                }))
                            }
                            value={form.notes}
                        />
                    </label>
                </div>
                <Lines
                    errors={errors}
                    items={form.items}
                    max={100}
                    products={options.products}
                    setItems={(items) => setForm((value) => ({ ...value, items }))}
                />
            </form>
        </Dialog>
    );
}
