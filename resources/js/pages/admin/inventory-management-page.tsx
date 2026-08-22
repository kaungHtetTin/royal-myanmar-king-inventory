import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    InventoryApiError,
    inventoryApi,
    type AdjustmentInput,
    type ImportInput,
    type InventoryBalance,
    type InventoryOptions,
    type ListFilters,
    type StockAdjustment,
    type StockImport,
    type StockMovement,
} from '../../services/inventory';
import { Icon, type IconName } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

type Tab = 'stock' | 'imports' | 'adjustments' | 'movements';
const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptyOptions: InventoryOptions = {
    movement_types: [],
    products: [],
    warehouses: [],
};
const tabLabels: Record<Tab, string> = {
    stock: 'On hand',
    imports: 'Imports',
    adjustments: 'Adjustments',
    movements: 'Movement history',
};
const tabIcons: Record<Tab, IconName> = {
    stock: 'box',
    imports: 'plus',
    adjustments: 'adjustments',
    movements: 'transfer',
};

function errorMessage(error: unknown) {
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
function badge(status: string) {
    return status === 'posted' ? 'success' : status === 'voided' ? 'danger' : 'warning';
}

export function InventoryManagementPage() {
    const { user } = useSession();
    const isSuper = user?.roles.includes('super-admin');
    const canImport = Boolean(isSuper || user?.permissions.includes('inventory.import'));
    const canAdjust = Boolean(isSuper || user?.permissions.includes('inventory.adjust'));
    const [tab, setTab] = useState<Tab>('stock');
    const [options, setOptions] = useState(emptyOptions);
    const [rows, setRows] = useState<(InventoryBalance | StockImport | StockAdjustment | StockMovement)[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [filters, setFilters] = useState<ListFilters>({
        page: 1,
        stock: 'all',
    });
    const [draft, setDraft] = useState({
        search: '',
        warehouse_id: '',
        product_id: '',
        subtype: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [importDialog, setImportDialog] = useState<StockImport | null | undefined>(undefined);
    const [adjustDialog, setAdjustDialog] = useState<StockAdjustment | null | undefined>(undefined);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const operation =
                tab === 'stock'
                    ? inventoryApi.balances(filters)
                    : tab === 'imports'
                      ? inventoryApi.imports(filters)
                      : tab === 'adjustments'
                        ? inventoryApi.adjustments(filters)
                        : inventoryApi.movements(filters);
            const [response, available] = await Promise.all([operation, inventoryApi.options()]);
            setRows(response.data);
            setMeta(response.meta);
            setOptions(available);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters, tab]);

    useEffect(() => {
        let active = true;
        const operation =
            tab === 'stock'
                ? inventoryApi.balances(filters)
                : tab === 'imports'
                  ? inventoryApi.imports(filters)
                  : tab === 'adjustments'
                    ? inventoryApi.adjustments(filters)
                    : inventoryApi.movements(filters);
        void Promise.all([operation, inventoryApi.options()])
            .then(([response, available]) => {
                if (!active) return;
                setRows(response.data);
                setMeta(response.meta);
                setOptions(available);
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filters, tab]);
    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };
    const switchTab = (next: Tab) => {
        setLoading(true);
        setTab(next);
        setRows([]);
        setFilters({ page: 1, stock: next === 'stock' ? 'all' : undefined });
        setDraft({ search: '', warehouse_id: '', product_id: '', subtype: '' });
    };
    const command = async (operation: () => Promise<unknown>, message: string) => {
        setLoading(true);
        setError('');
        try {
            await operation();
            await load();
            showNotice(message);
        } catch (requestError) {
            setError(errorMessage(requestError));
            setLoading(false);
        }
    };
    const totalQuantity = useMemo(
        () => (tab === 'stock' ? (rows as InventoryBalance[]).reduce((sum, row) => sum + row.quantity, 0) : 0),
        [rows, tab],
    );

    return (
        <div className="admin-page inventory-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Inventory control</p>
                    <h1>Warehouse inventory</h1>
                    <p>Post controlled stock changes and trace every unit back to its source document.</p>
                </div>
                <div className="page-heading__actions">
                    {canAdjust ? (
                        <Button icon="adjustments" onClick={() => setAdjustDialog(null)} requiresOnline>
                            New adjustment
                        </Button>
                    ) : null}
                    {canImport ? (
                        <Button icon="plus" onClick={() => setImportDialog(null)} requiresOnline tone="primary">
                            New import
                        </Button>
                    ) : null}
                </div>
            </header>
            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Matching current filters"
                    icon="box"
                    label={tabLabels[tab]}
                    value={number(meta.total)}
                />
                <MetricCard
                    hint="Visible balance rows"
                    icon="warehouse"
                    label="Units on hand"
                    value={tab === 'stock' ? number(totalQuantity) : '—'}
                />
                <MetricCard
                    hint="Available to this account"
                    icon="building"
                    label="Warehouses"
                    value={number(options.warehouses.length)}
                />
                <MetricCard
                    hint="Active catalogue items"
                    icon="reports"
                    label="Products"
                    value={number(options.products.length)}
                />
            </div>
            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="box" size={15} />
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

            <Panel className="inventory-panel" eyebrow="Warehouse ledger" title={tabLabels[tab]}>
                <div
                    aria-label="Inventory sections"
                    className="section-tabs section-tabs--4 inventory-tabs"
                    role="tablist"
                >
                    {(Object.keys(tabLabels) as Tab[]).map((value) => (
                        <button
                            aria-selected={tab === value}
                            key={value}
                            onClick={() => switchTab(value)}
                            role="tab"
                            type="button"
                        >
                            <Icon name={tabIcons[value]} size={15} />
                            <span>{tabLabels[value]}</span>
                            {value === tab ? <span className="section-tab-count">{meta.total}</span> : null}
                        </button>
                    ))}
                </div>
                <form
                    className="filter-toolbar inventory-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        const common = {
                            page: 1,
                            warehouse_id: draft.warehouse_id ? Number(draft.warehouse_id) : undefined,
                            product_id: draft.product_id ? Number(draft.product_id) : undefined,
                        };
                        setFilters({
                            ...common,
                            ...(tab === 'movements'
                                ? {
                                      reference: draft.search,
                                      movement_type: draft.subtype,
                                  }
                                : { search: draft.search }),
                            ...(tab === 'stock' ? { stock: draft.subtype || 'all' } : {}),
                            ...(tab === 'imports' ? { status: draft.subtype } : {}),
                            ...(tab === 'adjustments' ? { adjustment_type: draft.subtype } : {}),
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">Search</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={
                                tab === 'movements'
                                    ? 'Reference'
                                    : tab === 'stock'
                                      ? 'SKU or product'
                                      : 'Reference or reason'
                            }
                            type="search"
                            value={draft.search}
                        />
                    </label>
                    <select
                        aria-label="Warehouse"
                        onChange={(event) =>
                            setDraft((value) => ({
                                ...value,
                                warehouse_id: event.target.value,
                            }))
                        }
                        value={draft.warehouse_id}
                    >
                        <option value="">All warehouses</option>
                        {options.warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.code} · {warehouse.name}
                            </option>
                        ))}
                    </select>
                    {tab === 'stock' || tab === 'adjustments' || tab === 'movements' ? (
                        <select
                            aria-label="Product"
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    product_id: event.target.value,
                                }))
                            }
                            value={draft.product_id}
                        >
                            <option value="">All products</option>
                            {options.products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.sku} · {product.name}
                                </option>
                            ))}
                        </select>
                    ) : null}
                    <SubtypeFilter draft={draft.subtype} options={options} setDraft={setDraft} tab={tab} />
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        Loading inventory…
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        description="No records match the current section and filters."
                        title={`No ${tabLabels[tab].toLowerCase()} found`}
                    />
                ) : (
                    <InventoryTable
                        canAdjust={canAdjust}
                        canImport={canImport}
                        onAdjustEdit={setAdjustDialog}
                        onCommand={command}
                        onImportEdit={setImportDialog}
                        rows={rows}
                        tab={tab}
                    />
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
                        type="button"
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
                        type="button"
                    >
                        Next
                    </button>
                </footer>
            </Panel>
            <ImportDialog
                importRecord={importDialog ?? null}
                onClose={() => setImportDialog(undefined)}
                onSaved={async (message) => {
                    setImportDialog(undefined);
                    await load();
                    showNotice(message);
                }}
                open={importDialog !== undefined}
                options={options}
            />
            <AdjustmentDialog
                adjustment={adjustDialog ?? null}
                onClose={() => setAdjustDialog(undefined)}
                onSaved={async (message) => {
                    setAdjustDialog(undefined);
                    await load();
                    showNotice(message);
                }}
                open={adjustDialog !== undefined}
                options={options}
            />
        </div>
    );
}

function SubtypeFilter({
    draft,
    options,
    setDraft,
    tab,
}: {
    draft: string;
    options: InventoryOptions;
    setDraft: React.Dispatch<
        React.SetStateAction<{
            search: string;
            warehouse_id: string;
            product_id: string;
            subtype: string;
        }>
    >;
    tab: Tab;
}) {
    const values =
        tab === 'stock'
            ? [
                  ['all', 'All stock'],
                  ['positive', 'Positive stock'],
                  ['zero', 'Zero stock'],
              ]
            : tab === 'imports'
              ? [
                    ['', 'All statuses'],
                    ['draft', 'Draft'],
                    ['posted', 'Posted'],
                    ['voided', 'Voided'],
                ]
              : tab === 'adjustments'
                ? [
                      ['', 'All directions'],
                      ['increase', 'Increase'],
                      ['decrease', 'Decrease'],
                  ]
                : [
                      ['', 'All movement types'],
                      ...options.movement_types.map((value) => [value, value.replaceAll('_', ' ')]),
                  ];
    return (
        <select
            aria-label="Type filter"
            onChange={(event) => setDraft((value) => ({ ...value, subtype: event.target.value }))}
            value={draft || (tab === 'stock' ? 'all' : '')}
        >
            {values.map(([value, label]) => (
                <option key={value} value={value}>
                    {label}
                </option>
            ))}
        </select>
    );
}

function InventoryTable({
    canAdjust,
    canImport,
    onAdjustEdit,
    onCommand,
    onImportEdit,
    rows,
    tab,
}: {
    canAdjust: boolean;
    canImport: boolean;
    onAdjustEdit: (value: StockAdjustment) => void;
    onCommand: (operation: () => Promise<unknown>, message: string) => Promise<void>;
    onImportEdit: (value: StockImport) => void;
    rows: (InventoryBalance | StockImport | StockAdjustment | StockMovement)[];
    tab: Tab;
}) {
    if (tab === 'stock')
        return (
            <div className="ui-table-wrap">
                <table className="ui-table">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Warehouse</th>
                            <th className="is-numeric">On hand</th>
                            <th>Last changed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(rows as InventoryBalance[]).map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <strong>{row.product.name}</strong>
                                    <small>
                                        {row.product.sku} · {row.product.unit}
                                    </small>
                                </td>
                                <td>
                                    <span className="table-primary">{row.warehouse.name}</span>
                                    <small>{row.warehouse.code}</small>
                                </td>
                                <td className="is-numeric">
                                    <strong className="stock-number">{number(row.quantity)}</strong>
                                    <small>{row.product.unit}</small>
                                </td>
                                <td>{dateTime(row.updated_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    if (tab === 'imports')
        return (
            <div className="ui-table-wrap">
                <table className="ui-table">
                    <thead>
                        <tr>
                            <th>Reference</th>
                            <th>Warehouse</th>
                            <th className="is-numeric">Items / units</th>
                            <th>Status</th>
                            <th>Created</th>
                            {canImport ? <th className="ui-table__actions">Actions</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {(rows as StockImport[]).map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <strong>{row.reference}</strong>
                                    <small>{row.created_by.name}</small>
                                </td>
                                <td>
                                    <span className="table-primary">{row.warehouse.name}</span>
                                    <small>{row.warehouse.code}</small>
                                </td>
                                <td className="is-numeric">
                                    <strong>
                                        {row.items.length} / {number(row.total_quantity)}
                                    </strong>
                                    <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                                </td>
                                <td>
                                    <StatusBadge tone={badge(row.status)}>{row.status}</StatusBadge>
                                    {row.void_reason ? <small>{row.void_reason}</small> : null}
                                </td>
                                <td>{dateTime(row.created_at)}</td>
                                {canImport ? (
                                    <td className="ui-table__actions">
                                        <div className="row-actions">
                                            {row.status === 'draft' ? (
                                                <>
                                                    <IconButton
                                                        icon="edit"
                                                        label={`Edit ${row.reference}`}
                                                        onClick={() => onImportEdit(row)}
                                                    />
                                                    <IconButton
                                                        icon="check"
                                                        label={`Post ${row.reference}`}
                                                        requiresOnline
                                                        onClick={() =>
                                                            void onCommand(
                                                                () => inventoryApi.postImport(row.id),
                                                                `${row.reference} posted.`,
                                                            )
                                                        }
                                                        tone="primary"
                                                    />
                                                </>
                                            ) : null}
                                            {row.status === 'posted' ? (
                                                <IconButton
                                                    icon="reverse"
                                                    label={`Void ${row.reference}`}
                                                    requiresOnline
                                                    onClick={() => {
                                                        const reason = window.prompt(
                                                            `Reason for voiding ${row.reference}`,
                                                        );
                                                        if (reason?.trim())
                                                            void onCommand(
                                                                () => inventoryApi.voidImport(row.id, reason.trim()),
                                                                `${row.reference} reversed.`,
                                                            );
                                                    }}
                                                    tone="danger"
                                                />
                                            ) : null}
                                        </div>
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    if (tab === 'adjustments')
        return (
            <div className="ui-table-wrap">
                <table className="ui-table">
                    <thead>
                        <tr>
                            <th>Reference</th>
                            <th>Product / warehouse</th>
                            <th>Direction</th>
                            <th className="is-numeric">Quantity</th>
                            <th>Reason</th>
                            <th>Status</th>
                            {canAdjust ? <th className="ui-table__actions">Actions</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {(rows as StockAdjustment[]).map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <strong>{row.reference}</strong>
                                    <small>{dateTime(row.created_at)}</small>
                                </td>
                                <td>
                                    <span className="table-primary">{row.product.name}</span>
                                    <small>
                                        {row.product.sku} · {row.warehouse.code}
                                    </small>
                                </td>
                                <td>
                                    <StatusBadge tone={row.adjustment_type === 'increase' ? 'success' : 'warning'}>
                                        {row.adjustment_type}
                                    </StatusBadge>
                                </td>
                                <td className="is-numeric">
                                    <strong>{number(row.quantity)}</strong>
                                    <small>{row.product.unit}</small>
                                </td>
                                <td>
                                    <span className="table-primary">{row.reason}</span>
                                    <small>{row.created_by.name}</small>
                                </td>
                                <td>
                                    <StatusBadge tone={badge(row.status)}>{row.status}</StatusBadge>
                                </td>
                                {canAdjust ? (
                                    <td className="ui-table__actions">
                                        <div className="row-actions">
                                            {row.status === 'draft' ? (
                                                <>
                                                    <IconButton
                                                        icon="edit"
                                                        label={`Edit ${row.reference}`}
                                                        onClick={() => onAdjustEdit(row)}
                                                    />
                                                    <IconButton
                                                        icon="check"
                                                        label={`Post ${row.reference}`}
                                                        requiresOnline
                                                        onClick={() =>
                                                            void onCommand(
                                                                () => inventoryApi.postAdjustment(row.id),
                                                                `${row.reference} posted.`,
                                                            )
                                                        }
                                                        tone="primary"
                                                    />
                                                </>
                                            ) : null}
                                        </div>
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    return (
        <div className="ui-table-wrap">
            <table className="ui-table">
                <thead>
                    <tr>
                        <th>When / reference</th>
                        <th>Movement</th>
                        <th>Product</th>
                        <th className="is-numeric">Quantity</th>
                        <th>Source / actor</th>
                        <th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows as StockMovement[]).map((row) => (
                        <tr key={row.id}>
                            <td>
                                <strong>{dateTime(row.occurred_at)}</strong>
                                <small>{row.reference}</small>
                            </td>
                            <td>
                                <StatusBadge tone={row.movement_type.endsWith('_IN') ? 'success' : 'warning'}>
                                    {row.movement_type.replaceAll('_', ' ')}
                                </StatusBadge>
                            </td>
                            <td>
                                <span className="table-primary">{row.product.name}</span>
                                <small>{row.product.sku}</small>
                            </td>
                            <td className="is-numeric">
                                <strong>
                                    {row.movement_type.endsWith('_IN') ? '+' : '−'}
                                    {number(row.quantity)}
                                </strong>
                                <small>{row.product.unit}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {row.source.type.replaceAll('_', ' ')} #{row.source.id}
                                </span>
                                <small>{row.actor.name}</small>
                            </td>
                            <td>{row.notes || '—'}</td>
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

function ImportDialog({
    importRecord,
    onClose,
    onSaved,
    open,
    options,
}: {
    importRecord: StockImport | null;
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: InventoryOptions;
}) {
    const [form, setForm] = useState<ImportInput>({
        warehouse_id: 0,
        notes: '',
        items: [{ product_id: 0, quantity: 1 }],
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setErrors({});
        setForm(
            importRecord
                ? {
                      warehouse_id: importRecord.warehouse.id,
                      notes: importRecord.notes ?? '',
                      items: importRecord.items.map((item) => ({
                          product_id: item.product.id,
                          quantity: item.quantity,
                      })),
                  }
                : {
                      warehouse_id: options.warehouses[0]?.id ?? 0,
                      notes: '',
                      items: [
                          {
                              product_id: options.products[0]?.id ?? 0,
                              quantity: 1,
                          },
                      ],
                  },
        );
    }, [importRecord, open, options]);
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            if (importRecord) await inventoryApi.updateImport(importRecord.id, form);
            else await inventoryApi.createImport(form);
            await onSaved(importRecord ? 'Import draft updated.' : 'Import draft created.');
        } catch (requestError) {
            if (requestError instanceof InventoryApiError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError)],
            }));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            description="Drafts do not change stock. Review the lines, then post from the import register."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} form="stock-import-form" requiresOnline tone="primary" type="submit">
                        {saving ? 'Saving…' : 'Save draft'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={importRecord ? `Edit import · ${importRecord.reference}` : 'Create stock import'}
            width="wide"
        >
            <form className="management-form" id="stock-import-form" onSubmit={submit}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Destination warehouse</span>
                        <select
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    warehouse_id: Number(event.target.value),
                                }))
                            }
                            required
                            value={form.warehouse_id}
                        >
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.code} · {warehouse.name}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="warehouse_id" />
                    </label>
                    <label className="ui-field">
                        <span>Notes</span>
                        <input
                            maxLength={2000}
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    notes: event.target.value,
                                }))
                            }
                            placeholder="Supplier, delivery, or receiving note"
                            value={form.notes}
                        />
                    </label>
                </div>
                <div className="import-lines">
                    <div className="import-lines__heading">
                        <strong>Products</strong>
                        <Button
                            icon="plus"
                            onClick={() =>
                                setForm((value) => ({
                                    ...value,
                                    items: [
                                        ...value.items,
                                        {
                                            product_id:
                                                options.products.find(
                                                    (product) =>
                                                        !value.items.some((item) => item.product_id === product.id),
                                                )?.id ?? 0,
                                            quantity: 1,
                                        },
                                    ],
                                }))
                            }
                        >
                            Add line
                        </Button>
                    </div>
                    {form.items.map((item, index) => (
                        <div className="import-line" key={index}>
                            <label className="ui-field">
                                <span>Product {index + 1}</span>
                                <select
                                    onChange={(event) =>
                                        setForm((value) => ({
                                            ...value,
                                            items: value.items.map((line, lineIndex) =>
                                                lineIndex === index
                                                    ? {
                                                          ...line,
                                                          product_id: Number(event.target.value),
                                                      }
                                                    : line,
                                            ),
                                        }))
                                    }
                                    required
                                    value={item.product_id}
                                >
                                    <option value={0}>Select product</option>
                                    {options.products.map((product) => (
                                        <option
                                            disabled={form.items.some(
                                                (line, lineIndex) =>
                                                    lineIndex !== index && line.product_id === product.id,
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
                                    min={1}
                                    onChange={(event) =>
                                        setForm((value) => ({
                                            ...value,
                                            items: value.items.map((line, lineIndex) =>
                                                lineIndex === index
                                                    ? {
                                                          ...line,
                                                          quantity: Number(event.target.value),
                                                      }
                                                    : line,
                                            ),
                                        }))
                                    }
                                    required
                                    step={1}
                                    type="number"
                                    value={item.quantity}
                                />
                                <FieldError errors={errors} name={`items.${index}.quantity`} />
                            </label>
                            <IconButton
                                disabled={form.items.length === 1}
                                icon="x"
                                label={`Remove product ${index + 1}`}
                                onClick={() =>
                                    setForm((value) => ({
                                        ...value,
                                        items: value.items.filter((_, lineIndex) => lineIndex !== index),
                                    }))
                                }
                            />
                        </div>
                    ))}
                </div>
            </form>
        </Dialog>
    );
}

function AdjustmentDialog({
    adjustment,
    onClose,
    onSaved,
    open,
    options,
}: {
    adjustment: StockAdjustment | null;
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: InventoryOptions;
}) {
    const [form, setForm] = useState<AdjustmentInput>({
        adjustment_type: 'increase',
        notes: '',
        product_id: 0,
        quantity: 1,
        reason: '',
        warehouse_id: 0,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        setErrors({});
        setForm(
            adjustment
                ? {
                      adjustment_type: adjustment.adjustment_type,
                      notes: adjustment.notes ?? '',
                      product_id: adjustment.product.id,
                      quantity: adjustment.quantity,
                      reason: adjustment.reason,
                      warehouse_id: adjustment.warehouse.id,
                  }
                : {
                      adjustment_type: 'increase',
                      notes: '',
                      product_id: options.products[0]?.id ?? 0,
                      quantity: 1,
                      reason: '',
                      warehouse_id: options.warehouses[0]?.id ?? 0,
                  },
        );
    }, [adjustment, open, options]);
    const change = <K extends keyof AdjustmentInput>(field: K, value: AdjustmentInput[K]) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            if (adjustment) await inventoryApi.updateAdjustment(adjustment.id, form);
            else await inventoryApi.createAdjustment(form);
            await onSaved(adjustment ? 'Adjustment draft updated.' : 'Adjustment draft created.');
        } catch (requestError) {
            if (requestError instanceof InventoryApiError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError)],
            }));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            description="A reason is mandatory. Decreases are checked against locked on-hand stock when posted."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={saving} form="stock-adjustment-form" requiresOnline tone="primary" type="submit">
                        {saving ? 'Saving…' : 'Save draft'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={adjustment ? `Edit adjustment · ${adjustment.reference}` : 'Create stock adjustment'}
        >
            <form className="management-form" id="stock-adjustment-form" onSubmit={submit}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Warehouse</span>
                        <select
                            onChange={(event) => change('warehouse_id', Number(event.target.value))}
                            required
                            value={form.warehouse_id}
                        >
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.code} · {warehouse.name}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="warehouse_id" />
                    </label>
                    <label className="ui-field">
                        <span>Product</span>
                        <select
                            onChange={(event) => change('product_id', Number(event.target.value))}
                            required
                            value={form.product_id}
                        >
                            {options.products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.sku} · {product.name}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="product_id" />
                    </label>
                    <label className="ui-field">
                        <span>Direction</span>
                        <select
                            onChange={(event) =>
                                change('adjustment_type', event.target.value as 'increase' | 'decrease')
                            }
                            value={form.adjustment_type}
                        >
                            <option value="increase">Increase stock</option>
                            <option value="decrease">Decrease stock</option>
                        </select>
                    </label>
                    <label className="ui-field">
                        <span>Quantity</span>
                        <input
                            min={1}
                            onChange={(event) => change('quantity', Number(event.target.value))}
                            required
                            step={1}
                            type="number"
                            value={form.quantity}
                        />
                        <FieldError errors={errors} name="quantity" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Reason</span>
                        <input
                            autoFocus
                            maxLength={500}
                            onChange={(event) => change('reason', event.target.value)}
                            placeholder="Verified physical count difference"
                            required
                            value={form.reason}
                        />
                        <FieldError errors={errors} name="reason" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Notes</span>
                        <textarea
                            maxLength={2000}
                            onChange={(event) => change('notes', event.target.value)}
                            rows={3}
                            value={form.notes}
                        />
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
