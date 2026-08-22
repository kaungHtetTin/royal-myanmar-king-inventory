import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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
    type WarehouseTransfer,
    type WarehouseTransferInput,
    type WarehouseTransferOptions,
} from '../../services/transfers';
import { Icon, type IconName } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

type Tab = 'warehouse' | 'representative' | 'stock';
const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
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
    stock: 'Representative stock',
};
const tabIcons: Record<Tab, IconName> = {
    warehouse: 'warehouse',
    representative: 'users',
    stock: 'box',
};
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}
function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
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
            ...(canViewRepresentative ? ['representative' as Tab, 'stock' as Tab] : []),
        ],
        [canViewRepresentative, canViewWarehouse],
    );
    const [tab, setTab] = useState<Tab>(availableTabs[0] ?? 'warehouse');
    const [rows, setRows] = useState<(WarehouseTransfer | RepresentativeTransfer | RepresentativeInventory)[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [filters, setFilters] = useState<TransferFilters>({ page: 1 });
    const [draft, setDraft] = useState({ search: '', status: '' });
    const [warehouseOptions, setWarehouseOptions] = useState(emptyWarehouseOptions);
    const [representativeOptions, setRepresentativeOptions] = useState(emptyRepresentativeOptions);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [warehouseDialog, setWarehouseDialog] = useState<WarehouseTransfer | null | undefined>(undefined);
    const [representativeDialog, setRepresentativeDialog] = useState<RepresentativeTransfer | null | undefined>(
        undefined,
    );

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
                setWarehouseOptions(options);
            } else if (tab === 'representative') {
                const [response, options] = await Promise.all([
                    transferApi.representativeTransfers(filters),
                    transferApi.representativeOptions(),
                ]);
                setRows(response.data);
                setMeta(response.meta);
                setRepresentativeOptions(options);
            } else {
                const [response, options] = await Promise.all([
                    transferApi.representativeInventory(filters),
                    transferApi.representativeOptions(),
                ]);
                setRows(response.data);
                setMeta(response.meta);
                setRepresentativeOptions(options);
            }
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters, tab]);

    useEffect(() => {
        let active = true;
        const operation =
            tab === 'warehouse'
                ? Promise.all([transferApi.warehouseTransfers(filters), transferApi.warehouseOptions()])
                : tab === 'representative'
                  ? Promise.all([transferApi.representativeTransfers(filters), transferApi.representativeOptions()])
                  : Promise.all([transferApi.representativeInventory(filters), transferApi.representativeOptions()]);
        void operation
            .then(([response, options]) => {
                if (!active) return;
                setRows(response.data);
                setMeta(response.meta);
                if (tab === 'warehouse') setWarehouseOptions(options as WarehouseTransferOptions);
                else setRepresentativeOptions(options as RepresentativeTransferOptions);
                setError('');
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
    }, [filters, tab]);

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
            setError(message(requestError));
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
    const totalUnits = rows.reduce(
        (sum, row) => sum + ('total_quantity' in row ? row.total_quantity : row.quantity),
        0,
    );

    return (
        <div className="admin-page transfer-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Stock movement</p>
                    <h1>Transfers</h1>
                    <p>
                        Move stock through dispatch, in transit, receipt, and controlled reversal without losing custody
                        history.
                    </p>
                </div>
                <div className="page-heading__actions">
                    {tab === 'warehouse' && canCreateWarehouse ? (
                        <Button icon="plus" onClick={() => setWarehouseDialog(null)} tone="primary">
                            New warehouse transfer
                        </Button>
                    ) : null}
                    {tab === 'representative' && canIssue ? (
                        <Button icon="plus" onClick={() => setRepresentativeDialog(null)} tone="primary">
                            New representative issue
                        </Button>
                    ) : null}
                </div>
            </header>
            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Matching current filters"
                    icon="transfer"
                    label={labels[tab]}
                    value={number(meta.total)}
                />
                <MetricCard hint="Visible rows" icon="box" label="Units" value={number(totalUnits)} />
                <MetricCard
                    hint="Active transfer products"
                    icon="reports"
                    label="Products"
                    value={number((tab === 'warehouse' ? warehouseOptions : representativeOptions).products.length)}
                />
                <MetricCard
                    hint="Current workflow stage"
                    icon="truck"
                    label="In transit rows"
                    value={String(rows.filter((row) => 'status' in row && row.status === 'dispatched').length)}
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
                        Retry
                    </button>
                </div>
            ) : null}
            <Panel className="transfer-panel" eyebrow="Custody register" title={labels[tab]}>
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
                            <span>{labels[value]}</span>
                            {tab === value ? <span className="section-tab-count">{meta.total}</span> : null}
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
                            aria-label="Search transfers"
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={tab === 'stock' ? 'Product or SKU' : 'Transfer reference'}
                            type="search"
                            value={draft.search}
                        />
                    </label>
                    {tab !== 'stock' ? (
                        <select
                            aria-label="Transfer status"
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    status: event.target.value,
                                }))
                            }
                            value={draft.status}
                        >
                            <option value="">All statuses</option>
                            <option value="draft">Draft</option>
                            <option value="dispatched">Dispatched</option>
                            <option value="received">Received</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="reversed">Reversed</option>
                        </select>
                    ) : null}
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading transfers…
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        description="No records match the selected workflow and filters."
                        title={`No ${labels[tab].toLowerCase()} found`}
                    />
                ) : tab === 'warehouse' ? (
                    <WarehouseTable
                        canCreate={canCreateWarehouse}
                        canDispatch={canDispatchWarehouse}
                        canReceive={canReceiveWarehouse}
                        canReverse={canReverseWarehouse}
                        command={command}
                        edit={setWarehouseDialog}
                        rows={rows as WarehouseTransfer[]}
                    />
                ) : tab === 'representative' ? (
                    <RepresentativeTable
                        canIssue={canIssue}
                        command={command}
                        edit={setRepresentativeDialog}
                        rows={rows as RepresentativeTransfer[]}
                    />
                ) : (
                    <StockTable rows={rows as RepresentativeInventory[]} />
                )}
                <footer className="table-footer">
                    <span>
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total}
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
                        Previous
                    </button>
                    <strong>
                        Page {meta.current_page} of {meta.last_page}
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
                        Next
                    </button>
                </footer>
            </Panel>
            <WarehouseTransferDialog
                onClose={() => setWarehouseDialog(undefined)}
                onSaved={async (value) => {
                    setWarehouseDialog(undefined);
                    await load();
                    showNotice(value);
                }}
                open={warehouseDialog !== undefined}
                options={warehouseOptions}
                transfer={warehouseDialog ?? null}
            />
            <RepresentativeTransferDialog
                onClose={() => setRepresentativeDialog(undefined)}
                onSaved={async (value) => {
                    setRepresentativeDialog(undefined);
                    await load();
                    showNotice(value);
                }}
                open={representativeDialog !== undefined}
                options={representativeOptions}
                transfer={representativeDialog ?? null}
            />
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
    return (
        <div className="ui-table-wrap">
            <table className="ui-table transfer-table">
                <thead>
                    <tr>
                        <th>Reference</th>
                        <th>Route</th>
                        <th>Products / units</th>
                        <th>Custody</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th className="ui-table__actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>{row.reference}</strong>
                                <small>{row.created_by?.name}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.source_warehouse.code} → {row.destination_warehouse.code}
                                </span>
                                <small>
                                    {row.source_warehouse.name} to {row.destination_warehouse.name}
                                </small>
                            </td>
                            <td>
                                <strong>
                                    {row.items.length} / {number(row.total_quantity)}
                                </strong>
                                <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.status === 'dispatched'
                                        ? `${number(row.items.reduce((sum, item) => sum + item.in_transit_quantity, 0))} in transit`
                                        : row.status === 'received'
                                          ? 'At destination'
                                          : row.status === 'reversed'
                                            ? 'Returned'
                                            : 'No stock effect'}
                                </span>
                                <small>{row.notes || 'No notes'}</small>
                            </td>
                            <td>
                                <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
                            </td>
                            <td>{dateTime(row.created_at)}</td>
                            <td className="ui-table__actions">
                                <div className="row-actions">
                                    {row.status === 'draft' && canCreate ? (
                                        <>
                                            <IconButton
                                                icon="edit"
                                                label={`Edit ${row.reference}`}
                                                onClick={() => edit(row)}
                                            />
                                            <IconButton
                                                icon="x"
                                                label={`Cancel ${row.reference}`}
                                                requiresOnline
                                                onClick={() => {
                                                    const reason = window.prompt(
                                                        `Reason for cancelling ${row.reference}`,
                                                    );
                                                    if (reason?.trim())
                                                        void command(
                                                            () =>
                                                                transferApi.warehouseReasonCommand(
                                                                    row.id,
                                                                    'cancel',
                                                                    reason.trim(),
                                                                ),
                                                            `${row.reference} cancelled.`,
                                                        );
                                                }}
                                            />
                                        </>
                                    ) : null}
                                    {row.status === 'draft' && canDispatch ? (
                                        <IconButton
                                            icon="truck"
                                            label={`Dispatch ${row.reference}`}
                                            requiresOnline
                                            onClick={() =>
                                                void command(
                                                    () => transferApi.warehouseCommand(row.id, 'dispatch'),
                                                    `${row.reference} dispatched.`,
                                                )
                                            }
                                            tone="primary"
                                        />
                                    ) : null}
                                    {row.status === 'dispatched' && canReceive ? (
                                        <IconButton
                                            icon="check"
                                            label={`Receive ${row.reference}`}
                                            requiresOnline
                                            onClick={() =>
                                                void command(
                                                    () => transferApi.warehouseCommand(row.id, 'receive'),
                                                    `${row.reference} received.`,
                                                )
                                            }
                                            tone="primary"
                                        />
                                    ) : null}
                                    {['dispatched', 'received'].includes(row.status) && canReverse ? (
                                        <IconButton
                                            icon="reverse"
                                            label={`Reverse ${row.reference}`}
                                            requiresOnline
                                            onClick={() => {
                                                const reason = window.prompt(`Reason for reversing ${row.reference}`);
                                                if (reason?.trim())
                                                    void command(
                                                        () =>
                                                            transferApi.warehouseReasonCommand(
                                                                row.id,
                                                                'reverse',
                                                                reason.trim(),
                                                            ),
                                                        `${row.reference} reversed.`,
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
    rows,
}: {
    canIssue: boolean;
    command: (operation: () => Promise<unknown>, message: string) => Promise<void>;
    edit: (row: RepresentativeTransfer) => void;
    rows: RepresentativeTransfer[];
}) {
    return (
        <div className="ui-table-wrap">
            <table className="ui-table transfer-table">
                <thead>
                    <tr>
                        <th>Reference</th>
                        <th>Representative</th>
                        <th>Source</th>
                        <th>Products / units</th>
                        <th>Custody</th>
                        <th>Status</th>
                        <th className="ui-table__actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>{row.reference}</strong>
                                <small>{dateTime(row.created_at)}</small>
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
                                    {row.items.length} / {number(row.total_quantity)}
                                </strong>
                                <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.status === 'dispatched'
                                        ? 'Awaiting representative'
                                        : row.status === 'received'
                                          ? 'Representative stock'
                                          : row.status === 'reversed'
                                            ? 'Returned'
                                            : 'No stock effect'}
                                </span>
                                <small>{row.received_by?.name || row.notes || '—'}</small>
                            </td>
                            <td>
                                <StatusBadge tone={tone(row.status)}>{row.status}</StatusBadge>
                            </td>
                            <td className="ui-table__actions">
                                <div className="row-actions">
                                    {row.status === 'draft' && canIssue ? (
                                        <>
                                            <IconButton
                                                icon="edit"
                                                label={`Edit ${row.reference}`}
                                                onClick={() => edit(row)}
                                            />
                                            <IconButton
                                                icon="x"
                                                label={`Cancel ${row.reference}`}
                                                requiresOnline
                                                onClick={() => {
                                                    const reason = window.prompt(
                                                        `Reason for cancelling ${row.reference}`,
                                                    );
                                                    if (reason?.trim())
                                                        void command(
                                                            () =>
                                                                transferApi.representativeReasonCommand(
                                                                    row.id,
                                                                    'cancel',
                                                                    reason.trim(),
                                                                ),
                                                            `${row.reference} cancelled.`,
                                                        );
                                                }}
                                            />
                                            <IconButton
                                                icon="truck"
                                                label={`Dispatch ${row.reference}`}
                                                requiresOnline
                                                onClick={() =>
                                                    void command(
                                                        () => transferApi.representativeCommand(row.id, 'dispatch'),
                                                        `${row.reference} dispatched.`,
                                                    )
                                                }
                                                tone="primary"
                                            />
                                        </>
                                    ) : null}
                                    {['dispatched', 'received'].includes(row.status) && canIssue ? (
                                        <IconButton
                                            icon="reverse"
                                            label={`Reverse ${row.reference}`}
                                            requiresOnline
                                            onClick={() => {
                                                const reason = window.prompt(`Reason for reversing ${row.reference}`);
                                                if (reason?.trim())
                                                    void command(
                                                        () =>
                                                            transferApi.representativeReasonCommand(
                                                                row.id,
                                                                'reverse',
                                                                reason.trim(),
                                                            ),
                                                        `${row.reference} reversed.`,
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
function StockTable({ rows }: { rows: RepresentativeInventory[] }) {
    return (
        <div className="ui-table-wrap">
            <table className="ui-table">
                <thead>
                    <tr>
                        <th>Representative</th>
                        <th>Product</th>
                        <th className="is-numeric">On hand</th>
                        <th className="is-numeric">Incoming</th>
                        <th className="is-numeric">Capacity left</th>
                        <th>Updated</th>
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
                                <strong>{row.quantity}</strong>
                            </td>
                            <td className="is-numeric">
                                <strong>{row.pending_quantity}</strong>
                            </td>
                            <td className="is-numeric">
                                <strong>{row.capacity_remaining}</strong>
                                <small>of 100</small>
                            </td>
                            <td>{dateTime(row.updated_at)}</td>
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
    return (
        <div className="import-lines">
            <div className="import-lines__heading">
                <strong>Products</strong>
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
                    Add line
                </Button>
            </div>
            {items.map((item, index) => (
                <div className="import-line" key={index}>
                    <label className="ui-field">
                        <span>Product {index + 1}</span>
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
                            <option value={0}>Select product</option>
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
                        <span>Quantity</span>
                        <input
                            max={max}
                            min={1}
                            onChange={(event) =>
                                setItems(
                                    items.map((line, lineIndex) =>
                                        lineIndex === index
                                            ? {
                                                  ...line,
                                                  quantity: Number(event.target.value),
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
                        label={`Remove product ${index + 1}`}
                        onClick={() => setItems(items.filter((_, lineIndex) => lineIndex !== index))}
                    />
                </div>
            ))}
        </div>
    );
}

function WarehouseTransferDialog({
    onClose,
    onSaved,
    open,
    options,
    transfer,
}: {
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: WarehouseTransferOptions;
    transfer: WarehouseTransfer | null;
}) {
    const [form, setForm] = useState<WarehouseTransferInput>({
        destination_warehouse_id: 0,
        items: [{ product_id: 0, quantity: 1 }],
        notes: '',
        source_warehouse_id: 0,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setErrors({});
        setForm(
            transfer
                ? {
                      source_warehouse_id: transfer.source_warehouse.id,
                      destination_warehouse_id: transfer.destination_warehouse.id,
                      notes: transfer.notes ?? '',
                      items: transfer.items.map((item) => ({
                          product_id: item.product.id,
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
            if (transfer) await transferApi.updateWarehouseTransfer(transfer.id, form);
            else await transferApi.createWarehouseTransfer(form);
            await onSaved(transfer ? 'Warehouse transfer draft updated.' : 'Warehouse transfer draft created.');
        } catch (requestError) {
            if (requestError instanceof TransferApiError) setErrors(requestError.fields);
            setErrors((value) => ({ ...value, form: [message(requestError)] }));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            description="Drafts are stock-neutral. Dispatch reserves custody in transit; destination users receive in full."
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={saving}
                        form="warehouse-transfer-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save draft'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={transfer ? `Edit transfer · ${transfer.reference}` : 'Create warehouse transfer'}
            width="wide"
        >
            <form className="management-form" id="warehouse-transfer-form" onSubmit={submit}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Source warehouse</span>
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
                        <span>Destination warehouse</span>
                        <select
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    destination_warehouse_id: Number(event.target.value),
                                }))
                            }
                            value={form.destination_warehouse_id}
                        >
                            {options.destination_warehouses
                                .filter((warehouse) => warehouse.id !== form.source_warehouse_id)
                                .map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                        {warehouse.code} · {warehouse.name}
                                    </option>
                                ))}
                        </select>
                        <FieldError errors={errors} name="destination_warehouse_id" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Notes</span>
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
                    products={options.products}
                    setItems={(items) => setForm((value) => ({ ...value, items }))}
                />
            </form>
        </Dialog>
    );
}
function RepresentativeTransferDialog({
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
    const [form, setForm] = useState<RepresentativeTransferInput>({
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
                      source_warehouse_id: transfer.source_warehouse.id,
                      sales_representative_id: transfer.representative.id,
                      notes: transfer.notes ?? '',
                      items: transfer.items.map((item) => ({
                          product_id: item.product.id,
                          quantity: item.quantity,
                      })),
                  }
                : {
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
            await onSaved(transfer ? 'Representative issue draft updated.' : 'Representative issue draft created.');
        } catch (requestError) {
            if (requestError instanceof TransferApiError) setErrors(requestError.fields);
            setErrors((value) => ({ ...value, form: [message(requestError)] }));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            description="Dispatch validates warehouse stock and reserves current plus pending representative capacity up to 100 per product."
            footer={
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={saving}
                        form="representative-transfer-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save draft'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={transfer ? `Edit issue · ${transfer.reference}` : 'Create representative issue'}
            width="wide"
        >
            <form className="management-form" id="representative-transfer-form" onSubmit={submit}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Source warehouse</span>
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
                        <span>Representative</span>
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
                        <span>Notes</span>
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
