import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    InventoryApiError,
    inventoryApi,
    type AdjustmentInput,
    type ImportInput,
    type InventoryBalance,
    type InventoryOptions,
    type InventorySummary,
    type ListFilters,
    type StockAdjustment,
    type StockImport,
    type StockMovement,
} from '../../services/inventory';
import { Icon, type IconName } from '../../ui/icons';
import { editableNumber } from '../../ui/form-values';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale, type LocaleContextValue } from '../../localization/locale-context';

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
const emptySummary: InventorySummary = { products: 0, total: 0, units: 0, warehouses: 0 };
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

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function stockUnits(
    row: InventoryBalance,
    formatNumber: LocaleContextValue['formatNumber'],
    t: LocaleContextValue['t'],
) {
    const baseName = row.product.base_unit?.name ?? row.product.unit;
    const sellingUnit = row.product.default_selling_unit;
    const conversion = sellingUnit?.conversion_factor ?? 1;

    if (!sellingUnit || conversion <= 1 || sellingUnit.name === baseName) {
        return {
            baseName,
            equivalent: `${formatNumber(row.quantity)} ${baseName}`,
            conversion: t('{unit} is the base unit', { unit: sellingUnit?.name ?? baseName }),
        };
    }

    const sellingQuantity = Math.floor(row.quantity / conversion);
    const remainder = row.quantity % conversion;

    return {
        baseName,
        equivalent: `${formatNumber(sellingQuantity)} ${sellingUnit.name}${remainder ? ` + ${formatNumber(remainder)} ${baseName}` : ''}`,
        conversion: t('1 {sellingUnit} = {conversion} {baseUnit}', {
            sellingUnit: sellingUnit.name,
            conversion: formatNumber(conversion),
            baseUnit: baseName,
        }),
    };
}
function badge(status: string) {
    return status === 'posted' ? 'success' : status === 'voided' ? 'danger' : 'warning';
}

export function InventoryManagementPage() {
    const { user } = useSession();
    const navigate = useNavigate();
    const { formatNumber, t } = useLocale();
    const isSuper = user?.roles.includes('super-admin');
    const canImport = Boolean(isSuper || user?.permissions.includes('inventory.import'));
    const canAdjust = Boolean(isSuper || user?.permissions.includes('inventory.adjust'));
    const [tab, setTab] = useState<Tab>('stock');
    const [options, setOptions] = useState(emptyOptions);
    const [rows, setRows] = useState<(InventoryBalance | StockImport | StockAdjustment | StockMovement)[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
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
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
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
            setSummary(response.summary ?? emptySummary);
            setOptions(available);
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [filters, tab, t]);

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
                setSummary(response.summary ?? emptySummary);
                setOptions(available);
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filters, tab, t]);
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
            setError(errorMessage(requestError, t('Unable to complete the request.')));
            setLoading(false);
        }
    };
    const exportOnHand = async () => {
        setExporting(true);
        setError('');
        try {
            const { blob, filename } = await inventoryApi.exportBalances(filters);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setExporting(false);
        }
    };
    return (
        <div className="admin-page inventory-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Inventory control')}</p>
                    <h1>{t('Warehouse inventory')}</h1>
                    <p>{t('Post controlled stock changes and trace every unit back to its source document.')}</p>
                </div>
                <div className="page-heading__actions">
                    {canAdjust ? (
                        <Button icon="adjustments" onClick={() => setAdjustDialog(null)} requiresOnline>
                            {t('New adjustment')}
                        </Button>
                    ) : null}
                    {canImport ? (
                        <Button
                            icon="plus"
                            onClick={() => navigate('/admin/inventory/imports/new')}
                            requiresOnline
                            tone="primary"
                        >
                            {t('New import')}
                        </Button>
                    ) : null}
                </div>
            </header>
            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="box"
                    label={t(tabLabels[tab])}
                    value={formatNumber(summary.total)}
                />
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="warehouse"
                    label={t('Base units')}
                    value={formatNumber(summary.units)}
                />
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="building"
                    label={t('Warehouses')}
                    value={formatNumber(summary.warehouses)}
                />
                <MetricCard
                    hint={t('Matching current filters')}
                    icon="reports"
                    label={t('Products')}
                    value={formatNumber(summary.products)}
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
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel
                actions={
                    tab === 'stock' ? (
                        <Button
                            disabled={loading || exporting || meta.total === 0}
                            icon="download"
                            onClick={() => void exportOnHand()}
                            requiresOnline
                        >
                            {exporting ? t('Exporting…') : t('Export CSV')}
                        </Button>
                    ) : null
                }
                className="inventory-panel"
                eyebrow={t('Warehouse ledger')}
                title={t(tabLabels[tab])}
            >
                <div
                    aria-label={t('Inventory sections')}
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
                            <span>{t(tabLabels[value])}</span>
                            {value === tab ? (
                                <span className="section-tab-count">{formatNumber(meta.total)}</span>
                            ) : null}
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
                            product_id: tab !== 'stock' && draft.product_id ? Number(draft.product_id) : undefined,
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
                        <span className="sr-only">{t('Search')}</span>
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
                                    ? t('Reference')
                                    : tab === 'stock'
                                      ? t('SKU or product')
                                      : t('Reference or reason')
                            }
                            type="search"
                            value={draft.search}
                        />
                    </label>
                    <select
                        aria-label={t('Warehouse')}
                        onChange={(event) =>
                            setDraft((value) => ({
                                ...value,
                                warehouse_id: event.target.value,
                            }))
                        }
                        value={draft.warehouse_id}
                    >
                        <option value="">{t('All warehouses')}</option>
                        {options.warehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.code} · {warehouse.name}
                            </option>
                        ))}
                    </select>
                    {tab === 'adjustments' || tab === 'movements' ? (
                        <select
                            aria-label={t('Product')}
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    product_id: event.target.value,
                                }))
                            }
                            value={draft.product_id}
                        >
                            <option value="">{t('All products')}</option>
                            {options.products.map((product) => (
                                <option key={product.id} value={product.id}>
                                    {product.sku} · {product.name}
                                </option>
                            ))}
                        </select>
                    ) : null}
                    <SubtypeFilter draft={draft.subtype} options={options} setDraft={setDraft} tab={tab} />
                    <Button icon="search" type="submit">
                        {t('Apply')}
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading inventory…')}
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        description={t('No records match the current section and filters.')}
                        title={t('No {section} found', { section: t(tabLabels[tab]) })}
                    />
                ) : (
                    <InventoryTable
                        canAdjust={canAdjust}
                        canImport={canImport}
                        onAdjustEdit={setAdjustDialog}
                        onCommand={command}
                        onImportEdit={(value) => navigate(`/admin/inventory/imports/${value.id}/edit`)}
                        rows={rows}
                        tab={tab}
                    />
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
                        type="button"
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
                        type="button"
                    >
                        {t('Next')}
                    </button>
                </footer>
            </Panel>
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
    const { t } = useLocale();
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
            aria-label={t('Type filter')}
            onChange={(event) => setDraft((value) => ({ ...value, subtype: event.target.value }))}
            value={draft || (tab === 'stock' ? 'all' : '')}
        >
            {values.map(([value, label]) => (
                <option key={value} value={value}>
                    {t(label)}
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
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');

    if (tab === 'stock')
        return (
            <div className="ui-table-wrap">
                <table className="ui-table inventory-on-hand-table">
                    <thead>
                        <tr>
                            <th>{t('Product')}</th>
                            <th className="is-numeric">{t('Base-unit stock')}</th>
                            <th>{t('Selling-unit equivalent')}</th>
                            <th>{t('Last changed')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(rows as InventoryBalance[]).map((row) => {
                            const units = stockUnits(row, formatNumber, t);
                            return (
                                <tr key={row.id}>
                                    <td>
                                        <strong>{row.product.name}</strong>
                                        <small>{row.product.sku}</small>
                                    </td>
                                    <td className="is-numeric">
                                        <strong className="stock-number">{formatNumber(row.quantity)}</strong>
                                        <small>{t('{unit} · stored quantity', { unit: units.baseName })}</small>
                                    </td>
                                    <td>
                                        <strong>{units.equivalent}</strong>
                                        <small>{units.conversion}</small>
                                    </td>
                                    <td>{dateTime(row.updated_at)}</td>
                                </tr>
                            );
                        })}
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
                            <th>{t('Reference')}</th>
                            <th>{t('Warehouse')}</th>
                            <th className="is-numeric">{t('Items / units')}</th>
                            <th>{t('Status')}</th>
                            <th>{t('Created')}</th>
                            {canImport ? <th className="ui-table__actions">{t('Actions')}</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {(rows as StockImport[]).map((row) => (
                            <tr key={row.id}>
                                <td>
                                    <strong>
                                        <Link
                                            className="inventory-reference-link"
                                            to={`/admin/inventory/imports/${row.id}`}
                                        >
                                            {row.reference}
                                        </Link>
                                    </strong>
                                    <small>{row.created_by.name}</small>
                                </td>
                                <td>
                                    <span className="table-primary">{row.warehouse.name}</span>
                                    <small>{row.warehouse.code}</small>
                                </td>
                                <td className="is-numeric">
                                    <strong>
                                        {formatNumber(row.items.length)} / {formatNumber(row.total_quantity)}
                                    </strong>
                                    <small>{row.items.map((item) => item.product.sku).join(', ')}</small>
                                </td>
                                <td>
                                    <StatusBadge tone={badge(row.status)}>{t(row.status)}</StatusBadge>
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
                                                        label={t('Edit {name}', { name: row.reference })}
                                                        onClick={() => onImportEdit(row)}
                                                    />
                                                    <IconButton
                                                        icon="check"
                                                        label={t('Post {reference}', { reference: row.reference })}
                                                        requiresOnline
                                                        onClick={() =>
                                                            void onCommand(
                                                                () => inventoryApi.postImport(row.id),
                                                                t('{reference} posted.', { reference: row.reference }),
                                                            )
                                                        }
                                                        tone="primary"
                                                    />
                                                </>
                                            ) : null}
                                            {row.status === 'posted' ? (
                                                <IconButton
                                                    icon="reverse"
                                                    label={t('Void {reference}', { reference: row.reference })}
                                                    requiresOnline
                                                    onClick={() => {
                                                        const reason = window.prompt(
                                                            t('Reason for voiding {reference}', {
                                                                reference: row.reference,
                                                            }),
                                                        );
                                                        if (reason?.trim())
                                                            void onCommand(
                                                                () => inventoryApi.voidImport(row.id, reason.trim()),
                                                                t('{reference} reversed.', {
                                                                    reference: row.reference,
                                                                }),
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
                            <th>{t('Reference')}</th>
                            <th>{t('Product / warehouse')}</th>
                            <th>{t('Direction')}</th>
                            <th className="is-numeric">{t('Quantity')}</th>
                            <th>{t('Reason')}</th>
                            <th>{t('Status')}</th>
                            {canAdjust ? <th className="ui-table__actions">{t('Actions')}</th> : null}
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
                                        {t(row.adjustment_type)}
                                    </StatusBadge>
                                </td>
                                <td className="is-numeric">
                                    <strong>{formatNumber(row.quantity)}</strong>
                                    <small>{row.product.unit}</small>
                                </td>
                                <td>
                                    <span className="table-primary">{row.reason}</span>
                                    <small>{row.created_by.name}</small>
                                </td>
                                <td>
                                    <StatusBadge tone={badge(row.status)}>{t(row.status)}</StatusBadge>
                                </td>
                                {canAdjust ? (
                                    <td className="ui-table__actions">
                                        <div className="row-actions">
                                            {row.status === 'draft' ? (
                                                <>
                                                    <IconButton
                                                        icon="edit"
                                                        label={t('Edit {name}', { name: row.reference })}
                                                        onClick={() => onAdjustEdit(row)}
                                                    />
                                                    <IconButton
                                                        icon="check"
                                                        label={t('Post {reference}', { reference: row.reference })}
                                                        requiresOnline
                                                        onClick={() =>
                                                            void onCommand(
                                                                () => inventoryApi.postAdjustment(row.id),
                                                                t('{reference} posted.', { reference: row.reference }),
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
                        <th>{t('When / reference')}</th>
                        <th>{t('Movement')}</th>
                        <th>{t('Product')}</th>
                        <th className="is-numeric">{t('Quantity')}</th>
                        <th>{t('Source / actor')}</th>
                        <th>{t('Notes')}</th>
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
                                    {t(row.movement_type.replaceAll('_', ' '))}
                                </StatusBadge>
                            </td>
                            <td>
                                <span className="table-primary">{row.product.name}</span>
                                <small>{row.product.sku}</small>
                            </td>
                            <td className="is-numeric">
                                <strong>
                                    {row.movement_type.endsWith('_IN') ? '+' : '−'}
                                    {formatNumber(row.quantity)}
                                </strong>
                                <small>{row.product.unit}</small>
                            </td>
                            <td>
                                <span className="table-primary">
                                    {t(row.source.type.replaceAll('_', ' '))} #{formatNumber(row.source.id)}
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

export function StockImportFormPage() {
    const navigate = useNavigate();
    const { t } = useLocale();
    const { importId } = useParams();
    const [options, setOptions] = useState(emptyOptions);
    const [importRecord, setImportRecord] = useState<StockImport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([
            inventoryApi.options(),
            importId ? inventoryApi.importRecord(Number(importId)) : Promise.resolve(null),
        ])
            .then(([available, response]) => {
                if (!active) return;
                setOptions(available);
                setImportRecord(response?.data ?? null);
            })
            .catch((requestError) => {
                if (active) setError(errorMessage(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [importId, t]);

    return (
        <div className="admin-page stock-import-form-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Inventory control')}</p>
                    <h1>
                        {importRecord ? t('Edit {name}', { name: importRecord.reference }) : t('Create stock import')}
                    </h1>
                    <p>{t('Build and save a receiving draft before posting it from the import register.')}</p>
                </div>
                <Button icon="chevronLeft" onClick={() => navigate('/admin/inventory')}>
                    {t('Back to inventory')}
                </Button>
            </header>
            {notice ? <div className="ui-flash ui-flash--success">{notice}</div> : null}
            {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
            {loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    {t('Loading import form…')}
                </div>
            ) : (
                <StockImportForm
                    importRecord={importRecord}
                    onCancel={() => navigate('/admin/inventory')}
                    onPosted={() => navigate('/admin/inventory')}
                    onSaved={(record, message) => {
                        setImportRecord(record);
                        setNotice(message);
                    }}
                    options={options}
                />
            )}
        </div>
    );
}

function StockImportForm({
    importRecord,
    onCancel,
    onPosted,
    onSaved,
    options,
}: {
    importRecord: StockImport | null;
    onCancel: () => void;
    onPosted: () => void;
    onSaved: (record: StockImport, message: string) => void;
    options: InventoryOptions;
}) {
    const { formatNumber, t } = useLocale();
    const [form, setForm] = useState<ImportInput>(() =>
        importRecord
            ? {
                  warehouse_id: importRecord.warehouse.id,
                  notes: importRecord.notes ?? '',
                  items: importRecord.items.map((item) => ({
                      product_id: item.product.id,
                      product_unit_id:
                          item.product_unit?.id ??
                          options.products
                              .find((product) => product.id === item.product.id)
                              ?.units?.find((unit) => unit.is_default_selling)?.id ??
                          0,
                      quantity: item.quantity,
                  })),
              }
            : {
                  warehouse_id: options.warehouses[0]?.id ?? 0,
                  notes: '',
                  items: [],
              },
    );
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [step, setStep] = useState(1);
    const [productQuery, setProductQuery] = useState('');
    const filteredProducts = useMemo(() => {
        const query = productQuery.trim().toLowerCase();
        return options.products.filter((product) =>
            `${product.sku} ${product.name} ${product.unit}`.toLowerCase().includes(query),
        );
    }, [options.products, productQuery]);
    const next = () => {
        const nextErrors: Record<string, string[]> = {};
        if (step === 1 && !form.warehouse_id) nextErrors.warehouse_id = [t('Select a destination warehouse.')];
        if (step === 2) {
            if (!form.items.length) nextErrors.items = [t('Select at least one product.')];
            form.items.forEach((item, index) => {
                if (!item.product_id) nextErrors[`items.${index}.product_id`] = [t('Select a product.')];
            });
        }
        if (step === 3) {
            form.items.forEach((item, index) => {
                if (!item.product_unit_id) nextErrors[`items.${index}.product_unit_id`] = [t('Select a product unit.')];
                if (!Number.isInteger(item.quantity) || item.quantity < 1)
                    nextErrors[`items.${index}.quantity`] = [t('Enter a whole quantity of at least 1.')];
            });
        }
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length === 0) setStep((value) => Math.min(4, value + 1));
    };
    const saveDraft = async (): Promise<StockImport | null> => {
        const nextErrors: Record<string, string[]> = {};
        if (!form.warehouse_id) nextErrors.warehouse_id = [t('Select a destination warehouse.')];
        if (!form.items.length) nextErrors.items = [t('Select at least one product.')];
        form.items.forEach((item, index) => {
            if (!item.product_unit_id) nextErrors[`items.${index}.product_unit_id`] = [t('Select a product unit.')];
            if (!Number.isInteger(item.quantity) || item.quantity < 1)
                nextErrors[`items.${index}.quantity`] = [t('Enter a whole quantity of at least 1.')];
        });
        if (Object.keys(nextErrors).length) {
            setErrors(nextErrors);
            return null;
        }
        setSaving(true);
        setErrors({});
        try {
            const response = importRecord
                ? await inventoryApi.updateImport(importRecord.id, form)
                : await inventoryApi.createImport(form);
            onSaved(response.data, t(importRecord ? 'Import draft updated.' : 'Import draft created.'));
            return response.data;
        } catch (requestError) {
            if (requestError instanceof InventoryApiError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError, t('Unable to complete the request.'))],
            }));
        } finally {
            setSaving(false);
        }
        return null;
    };
    const postImport = async () => {
        const record = await saveDraft();
        if (!record) return;
        if (
            !window.confirm(
                t('Post {reference}? Warehouse stock will update immediately.', { reference: record.reference }),
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            await inventoryApi.postImport(record.id);
            onPosted();
        } catch (requestError) {
            setErrors({ form: [errorMessage(requestError, t('Unable to complete the request.'))] });
        } finally {
            setSaving(false);
        }
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        void saveDraft();
    };
    return (
        <section className="stock-import-form-page__panel">
            <form className="management-form" id="stock-import-form" onSubmit={submit}>
                <ol aria-label={t('Import progress')} className="form-stepper">
                    {['Basic information', 'Product selection', 'Unit & quantity', 'Review & submit'].map(
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
                    <div className="form-grid">
                        <label className="ui-field">
                            <span>{t('Destination warehouse')}</span>
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
                            <span>{t('Notes')}</span>
                            <input
                                maxLength={2000}
                                onChange={(event) =>
                                    setForm((value) => ({
                                        ...value,
                                        notes: event.target.value,
                                    }))
                                }
                                placeholder={t('Supplier, delivery, or receiving note')}
                                value={form.notes}
                            />
                        </label>
                    </div>
                ) : null}
                {step === 2 ? (
                    <div className="stock-import-products">
                        <div className="import-lines__heading">
                            <strong>{t('Select products')}</strong>
                            <small>{t('Choose every product included in this delivery.')}</small>
                        </div>
                        <div className="stock-import-products__toolbar">
                            <label className="stock-import-products__search">
                                <span className="sr-only">{t('Search import products')}</span>
                                <Icon name="search" size={16} />
                                <input
                                    onChange={(event) => setProductQuery(event.target.value)}
                                    placeholder={t('Search product name or SKU')}
                                    type="search"
                                    value={productQuery}
                                />
                            </label>
                            <strong aria-live="polite">
                                {t('{count} selected', { count: formatNumber(form.items.length) })}
                            </strong>
                            {form.items.length ? (
                                <Button
                                    onClick={() => {
                                        setForm((value) => ({ ...value, items: [] }));
                                        setErrors((value) => ({ ...value, items: [] }));
                                    }}
                                    tone="ghost"
                                >
                                    {t('Clear selection')}
                                </Button>
                            ) : null}
                        </div>
                        <div className="stock-import-products__list">
                            {filteredProducts.map((product) => {
                                const selected = form.items.some((item) => item.product_id === product.id);
                                return (
                                    <label
                                        className={`stock-import-product ${selected ? 'is-selected' : ''}`}
                                        key={product.id}
                                    >
                                        <input
                                            aria-label={t('Select {name}', { name: product.name })}
                                            checked={selected}
                                            onChange={() => {
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
                                                }));
                                                setErrors((value) => ({ ...value, items: [] }));
                                            }}
                                            type="checkbox"
                                        />
                                        <span>
                                            <strong>{product.name}</strong>
                                            <small>
                                                {product.sku} · {product.unit}
                                            </small>
                                        </span>
                                        <strong>{formatNumber(product.selling_price)} MMK</strong>
                                    </label>
                                );
                            })}
                        </div>
                        {filteredProducts.length === 0 ? (
                            <div className="stock-import-products__empty">{t('No products match your search.')}</div>
                        ) : null}
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}
                {step === 3 ? (
                    <div className="import-lines">
                        <div className="import-lines__heading">
                            <strong>{t('Units and quantities')}</strong>
                            <small>{t('Select how each product is packaged in this delivery.')}</small>
                        </div>
                        {form.items.map((item, index) => {
                            const selectedProduct = options.products.find((product) => product.id === item.product_id);
                            const baseUnit = selectedProduct?.units?.find((unit) => unit.is_base);
                            return (
                                <div className="import-line import-line--quantity" key={item.product_id}>
                                    <div>
                                        <strong>{selectedProduct?.name}</strong>
                                        <small>{selectedProduct?.sku}</small>
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
                                            {(selectedProduct?.units ?? []).map((unit) => (
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
                                        <span>{t('Import quantity')}</span>
                                        <input
                                            min={1}
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    items: value.items.map((line, lineIndex) =>
                                                        lineIndex === index
                                                            ? { ...line, quantity: editableNumber(event.target.value) }
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
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                {step === 4 ? (
                    <div className="import-review">
                        <section>
                            <p className="ui-eyebrow">{t('Basic information')}</p>
                            <strong>
                                {options.warehouses.find((warehouse) => warehouse.id === form.warehouse_id)?.name}
                            </strong>
                            <small>{form.notes || t('No receiving note')}</small>
                        </section>
                        <div className="ui-table-wrap">
                            <table className="ui-table">
                                <thead>
                                    <tr>
                                        <th>{t('Product')}</th>
                                        <th>{t('Unit')}</th>
                                        <th className="is-numeric">{t('Quantity')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((item) => {
                                        const selectedProduct = options.products.find(
                                            (product) => product.id === item.product_id,
                                        );
                                        const selectedUnit = selectedProduct?.units?.find(
                                            (unit) => unit.id === item.product_unit_id,
                                        );
                                        return (
                                            <tr key={item.product_id}>
                                                <td>
                                                    <strong>{selectedProduct?.name}</strong>
                                                    <small>
                                                        {t('{sku} · Base unit: {unit}', {
                                                            sku: selectedProduct?.sku ?? '',
                                                            unit:
                                                                selectedProduct?.units?.find((unit) => unit.is_base)
                                                                    ?.name ??
                                                                selectedProduct?.unit ??
                                                                '',
                                                        })}
                                                    </small>
                                                </td>
                                                <td>
                                                    <strong>{selectedUnit?.name ?? t('Not selected')}</strong>
                                                    <small>
                                                        {t('{count} base units each', {
                                                            count: formatNumber(selectedUnit?.conversion_factor ?? 0),
                                                        })}
                                                    </small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{formatNumber(item.quantity)}</strong>
                                                    <small>
                                                        {t('{count} base units', {
                                                            count: formatNumber(
                                                                item.quantity * (selectedUnit?.conversion_factor ?? 0),
                                                            ),
                                                        })}
                                                    </small>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="import-review__total">
                            <span>{t('{count} products', { count: formatNumber(form.items.length) })}</span>
                            <strong>
                                {t('{count} total base units', {
                                    count: formatNumber(
                                        form.items.reduce((sum, item) => {
                                            const product = options.products.find(
                                                (option) => option.id === item.product_id,
                                            );
                                            const unit = product?.units?.find(
                                                (option) => option.id === item.product_unit_id,
                                            );
                                            return sum + item.quantity * (unit?.conversion_factor ?? 0);
                                        }, 0),
                                    ),
                                })}
                            </strong>
                        </div>
                    </div>
                ) : null}
            </form>
            <footer className="stock-import-form-page__actions">
                <Button disabled={saving} onClick={onCancel}>
                    {t('Cancel')}
                </Button>
                {step > 1 ? (
                    <Button disabled={saving} onClick={() => setStep((value) => value - 1)}>
                        {t('Back')}
                    </Button>
                ) : null}
                {step === 3 ? (
                    <Button disabled={saving} onClick={() => void saveDraft()} requiresOnline>
                        {saving ? t('Saving…') : t('Save draft')}
                    </Button>
                ) : null}
                {step < 4 ? (
                    <Button disabled={saving} onClick={next} tone="primary">
                        {t(step === 3 ? 'Review' : 'Next')}
                    </Button>
                ) : (
                    <Button disabled={saving} onClick={() => void postImport()} requiresOnline tone="primary">
                        {saving ? t('Posting…') : t('Post import')}
                    </Button>
                )}
            </footer>
        </section>
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
    const { t } = useLocale();
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
            await onSaved(t(adjustment ? 'Adjustment draft updated.' : 'Adjustment draft created.'));
        } catch (requestError) {
            if (requestError instanceof InventoryApiError) setErrors(requestError.fields);
            setErrors((value) => ({
                ...value,
                form: [errorMessage(requestError, t('Unable to complete the request.'))],
            }));
        } finally {
            setSaving(false);
        }
    };
    return (
        <Dialog
            description={t('A reason is mandatory. Decreases are checked against locked on-hand stock when posted.')}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button disabled={saving} form="stock-adjustment-form" requiresOnline tone="primary" type="submit">
                        {saving ? t('Saving…') : t('Save draft')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={
                adjustment
                    ? t('Edit adjustment · {reference}', { reference: adjustment.reference })
                    : t('Create stock adjustment')
            }
        >
            <form className="management-form" id="stock-adjustment-form" onSubmit={submit}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>{t('Warehouse')}</span>
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
                        <span>{t('Product')}</span>
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
                        <span>{t('Direction')}</span>
                        <select
                            onChange={(event) =>
                                change('adjustment_type', event.target.value as 'increase' | 'decrease')
                            }
                            value={form.adjustment_type}
                        >
                            <option value="increase">{t('Increase stock')}</option>
                            <option value="decrease">{t('Decrease stock')}</option>
                        </select>
                    </label>
                    <label className="ui-field">
                        <span>{t('Quantity')}</span>
                        <input
                            min={1}
                            onChange={(event) => change('quantity', editableNumber(event.target.value))}
                            required
                            step={1}
                            type="number"
                            value={form.quantity}
                        />
                        <FieldError errors={errors} name="quantity" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Reason')}</span>
                        <input
                            autoFocus
                            maxLength={500}
                            onChange={(event) => change('reason', event.target.value)}
                            placeholder={t('Verified physical count difference')}
                            required
                            value={form.reason}
                        />
                        <FieldError errors={errors} name="reason" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Notes')}</span>
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
