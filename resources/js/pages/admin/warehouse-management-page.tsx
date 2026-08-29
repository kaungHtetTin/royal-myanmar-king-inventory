import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    WarehouseApiError,
    warehouseApi,
    type Warehouse,
    type WarehouseFilters,
    type WarehouseInput,
    type WarehouseSummary,
    type WarehouseRegion,
    type WarehouseWay,
} from '../../services/warehouses';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptySummary: WarehouseSummary = { active: 0, assigned_users: 0, inactive: 0, total: 0 };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}

function dateTime(value: string | null) {
    if (!value) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

export function WarehouseManagementPage() {
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('warehouse.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('warehouse.edit'));
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Warehouse | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        search: '',
        status: '',
    });
    const [filters, setFilters] = useState<WarehouseFilters>({
        page: 1,
    });

    const loadWarehouses = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await warehouseApi.list(filters);
            setWarehouses(response.data);
            setMeta(response.meta);
            setSummary(response.summary ?? emptySummary);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        let active = true;
        void warehouseApi
            .list(filters)
            .then((response) => {
                if (!active) return;
                setWarehouses(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
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
    }, [filters]);

    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="admin-page warehouse-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Master data</p>
                    <h1>Warehouses</h1>
                    <p>Maintain operational locations and warehouse availability.</p>
                </div>
                {canCreate ? (
                    <Button
                        icon="plus"
                        onClick={() => {
                            setSelected(null);
                            setDialogOpen(true);
                        }}
                        tone="primary"
                    >
                        New warehouse
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Current filtered result"
                    icon="warehouse"
                    label="Warehouses"
                    value={String(summary.total)}
                />
                <MetricCard
                    hint="Current filtered result"
                    icon="dashboard"
                    label="Active"
                    value={String(summary.active)}
                />
                <MetricCard
                    hint="Current filtered result"
                    icon="adjustments"
                    label="Inactive"
                    value={String(summary.inactive)}
                />
                <MetricCard
                    hint="Current filtered result"
                    icon="users"
                    label="Assigned users"
                    value={String(summary.assigned_users)}
                />
            </div>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="warehouse" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadWarehouses()} type="button">
                        Retry
                    </button>
                </div>
            ) : null}

            <Panel eyebrow="Locations" title="Warehouse directory">
                <form
                    className="filter-toolbar warehouse-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setFilters({
                            page: 1,
                            search: draftFilters.search,
                            status: draftFilters.status,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">Search warehouses</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder="Search code, name, or address"
                            type="search"
                            value={draftFilters.search}
                        />
                    </label>
                    <label>
                        <span className="sr-only">Filter by status</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    status: event.target.value,
                                }))
                            }
                            value={draftFilters.status}
                        >
                            <option value="">All statuses</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        Apply filters
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        Loading warehouses…
                    </div>
                ) : warehouses.length === 0 ? (
                    <EmptyState
                        description="Change the filters or create the first operational location."
                        title="No warehouses found"
                    />
                ) : (
                    <div className="ui-table-wrap warehouse-table-wrap">
                        <table className="ui-table warehouse-table">
                            <thead>
                                <tr>
                                    <th>Warehouse</th>
                                    <th>Address</th>
                                    <th>Contact</th>
                                    <th>Assigned users</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    {canEdit ? <th className="ui-table__actions">Actions</th> : null}
                                </tr>
                            </thead>
                            <tbody>
                                {warehouses.map((warehouse) => (
                                    <tr key={warehouse.id}>
                                        <td>
                                            <strong>{warehouse.name}</strong>
                                            <small>{warehouse.code}</small>
                                        </td>
                                        <td>
                                            <strong>{warehouse.address || 'No address recorded'}</strong>
                                        </td>
                                        <td>
                                            <span className="table-primary">{warehouse.phone || 'Not specified'}</span>
                                            <small>{warehouse.notes || 'No operational notes'}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{warehouse.users_count}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={warehouse.is_active ? 'success' : 'danger'}>
                                                {warehouse.is_active ? 'Active' : 'Inactive'}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(warehouse.updated_at)}</span>
                                            <small>Created {dateTime(warehouse.created_at)}</small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <Link
                                                    aria-label={`Open settings for ${warehouse.name}`}
                                                    className="ui-icon-button ui-icon-button--secondary"
                                                    title={`Open settings for ${warehouse.name}`}
                                                    to={`/admin/warehouses/${warehouse.id}/settings`}
                                                >
                                                    <Icon name="warehouse" />
                                                </Link>
                                                <IconButton
                                                    icon="settings"
                                                    label={`Edit ${warehouse.name}`}
                                                    onClick={() => {
                                                        setSelected(warehouse);
                                                        setDialogOpen(true);
                                                    }}
                                                />
                                            </td>
                                        ) : null}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <footer className="table-footer">
                    <span>
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} warehouses
                    </span>
                    <button
                        disabled={meta.current_page <= 1 || loading}
                        onClick={() => {
                            setLoading(true);
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page - 1,
                            }));
                        }}
                        type="button"
                    >
                        Previous
                    </button>
                    <strong>
                        Page {meta.current_page} of {meta.last_page}
                    </strong>
                    <button
                        disabled={meta.current_page >= meta.last_page || loading}
                        onClick={() => {
                            setLoading(true);
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page + 1,
                            }));
                        }}
                        type="button"
                    >
                        Next
                    </button>
                </footer>
            </Panel>

            <WarehouseDialog
                onClose={() => setDialogOpen(false)}
                onSaved={async (message) => {
                    setDialogOpen(false);
                    await loadWarehouses();
                    showNotice(message);
                }}
                open={dialogOpen}
                warehouse={selected}
            />
        </div>
    );
}

export function CoverageDialog({
    warehouse,
    onClose,
    onChanged,
}: {
    warehouse: Warehouse | null;
    onClose: () => void;
    onChanged: () => Promise<void>;
}) {
    const [regionName, setRegionName] = useState('');
    const [wayNames, setWayNames] = useState<Record<number, string>>({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    if (!warehouse) return null;
    const run = async (operation: () => Promise<unknown>, success: string) => {
        setBusy(true);
        setMessage('');
        try {
            await operation();
            setMessage(success);
            await onChanged();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    };
    const updateRegion = (region: WarehouseRegion, patch: Partial<WarehouseRegion>) =>
        run(
            () =>
                warehouseApi.updateRegion(region.id, {
                    name: patch.name ?? region.name,
                    notes: patch.notes ?? region.notes ?? '',
                    is_active: patch.is_active ?? region.is_active,
                }),
            'Region updated.',
        );
    const updateWay = (way: WarehouseWay, patch: Partial<WarehouseWay>) =>
        run(
            () =>
                warehouseApi.updateWay(way.id, {
                    name: patch.name ?? way.name,
                    notes: patch.notes ?? way.notes ?? '',
                    is_active: patch.is_active ?? way.is_active,
                }),
            'Way updated.',
        );
    return (
        <Dialog
            description="Representatives are assigned to regions; every customer is assigned to one generated-code Way."
            footer={
                <Button onClick={onClose} tone="secondary">
                    Close
                </Button>
            }
            onClose={onClose}
            open
            title={`Coverage · ${warehouse.name}`}
            width="wide"
        >
            <div className="coverage-manager">
                {message ? (
                    <div className="ui-form-note" role="status">
                        {message}
                    </div>
                ) : null}
                <form
                    className="coverage-manager__create"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!regionName.trim()) return;
                        void run(
                            () =>
                                warehouseApi.createRegion(warehouse.id, {
                                    name: regionName.trim(),
                                    notes: '',
                                    is_active: true,
                                }),
                            'Region created.',
                        ).then(() => setRegionName(''));
                    }}
                >
                    <label className="ui-field">
                        <span>New region name</span>
                        <input
                            disabled={busy}
                            onChange={(event) => setRegionName(event.target.value)}
                            placeholder="Enter region name"
                            value={regionName}
                        />
                    </label>
                    <Button disabled={busy || !regionName.trim()} icon="plus" type="submit">
                        Add region
                    </Button>
                </form>
                <div className="coverage-manager__regions">
                    {warehouse.regions.map((region) => (
                        <section className="coverage-region" key={region.id}>
                            <header>
                                <CoverageNameEditor
                                    busy={busy}
                                    key={`${region.id}-${region.name}`}
                                    label="Region name"
                                    name={region.name}
                                    onSave={(name) => updateRegion(region, { name })}
                                    supportingText={`${region.ways.length} ways`}
                                />
                                <Button
                                    disabled={busy}
                                    onClick={() => void updateRegion(region, { is_active: !region.is_active })}
                                    tone="secondary"
                                >
                                    {region.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                            </header>
                            <div className="coverage-way-list">
                                {region.ways.map((way) => (
                                    <div className="coverage-way" key={way.id}>
                                        <CoverageNameEditor
                                            busy={busy}
                                            key={`${way.id}-${way.name}`}
                                            label={`${way.code} name`}
                                            name={way.name}
                                            onSave={(name) => updateWay(way, { name })}
                                            supportingText={way.code}
                                        />
                                        <StatusBadge tone={way.is_active ? 'success' : 'danger'}>
                                            {way.is_active ? 'Active' : 'Inactive'}
                                        </StatusBadge>
                                        <Button
                                            disabled={busy}
                                            onClick={() => void updateWay(way, { is_active: !way.is_active })}
                                            tone="secondary"
                                        >
                                            {way.is_active ? 'Deactivate' : 'Activate'}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <form
                                className="coverage-way-create"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const name = wayNames[region.id]?.trim();
                                    if (!name) return;
                                    void run(
                                        () => warehouseApi.createWay(region.id, { name, notes: '', is_active: true }),
                                        'Way created with an automatic code.',
                                    ).then(() => setWayNames((value) => ({ ...value, [region.id]: '' })));
                                }}
                            >
                                <input
                                    aria-label={`New way in ${region.name}`}
                                    disabled={busy || !region.is_active}
                                    onChange={(event) =>
                                        setWayNames((value) => ({ ...value, [region.id]: event.target.value }))
                                    }
                                    placeholder="New Way name"
                                    value={wayNames[region.id] ?? ''}
                                />
                                <Button
                                    disabled={busy || !region.is_active || !wayNames[region.id]?.trim()}
                                    icon="plus"
                                    type="submit"
                                >
                                    Add Way
                                </Button>
                            </form>
                        </section>
                    ))}
                </div>
            </div>
        </Dialog>
    );
}

function CoverageNameEditor({
    busy,
    label,
    name,
    onSave,
    supportingText,
}: {
    busy: boolean;
    label: string;
    name: string;
    onSave: (name: string) => Promise<unknown>;
    supportingText: string;
}) {
    const [value, setValue] = useState(name);
    const changed = value.trim() !== name;
    return (
        <form
            className="coverage-name-editor"
            onSubmit={(event) => {
                event.preventDefault();
                if (changed && value.trim()) void onSave(value.trim());
            }}
        >
            <label>
                <span className="sr-only">{label}</span>
                <input
                    disabled={busy}
                    maxLength={100}
                    onChange={(event) => setValue(event.target.value)}
                    value={value}
                />
            </label>
            <small>{supportingText}</small>
            {changed ? (
                <Button disabled={busy || !value.trim()} tone="secondary" type="submit">
                    Save
                </Button>
            ) : null}
        </form>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function WarehouseDialog({
    onClose,
    onSaved,
    open,
    warehouse,
}: {
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    warehouse: Warehouse | null;
}) {
    const [form, setForm] = useState<WarehouseInput>({
        address: '',
        code: '',
        is_active: true,
        name: '',
        notes: '',
        phone: '',
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setErrors({});
        setForm({
            address: warehouse?.address ?? '',
            code: warehouse?.code ?? '',
            is_active: warehouse?.is_active ?? true,
            name: warehouse?.name ?? '',
            notes: warehouse?.notes ?? '',
            phone: warehouse?.phone ?? '',
        });
    }, [open, warehouse]);

    const change = (field: keyof WarehouseInput, value: boolean | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            warehouse?.is_active &&
            !form.is_active &&
            !window.confirm(`Deactivate ${warehouse.name}? It will no longer be available for new transactions.`)
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (warehouse) await warehouseApi.update(warehouse.id, form);
            else await warehouseApi.create(form);
            await onSaved(warehouse ? 'Warehouse updated.' : 'Warehouse created.');
        } catch (requestError) {
            if (requestError instanceof WarehouseApiError) setErrors(requestError.fields);
            setErrors((current) => ({
                ...current,
                form: [errorMessage(requestError)],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            description="Warehouse codes identify stock locations and cannot contain spaces."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={saving}
                        form="warehouse-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save warehouse'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={warehouse ? `Edit warehouse · ${warehouse.code}` : 'Create warehouse'}
        >
            <form className="management-form" id="warehouse-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Warehouse code</span>
                        <input
                            autoFocus
                            maxLength={30}
                            onChange={(event) => change('code', event.target.value.toUpperCase())}
                            placeholder="YGN-MAIN"
                            required
                            value={form.code}
                        />
                        <FieldError errors={errors} name="code" />
                    </label>
                    <label className="ui-field">
                        <span>Warehouse name</span>
                        <input
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Address</span>
                        <input
                            maxLength={500}
                            onChange={(event) => change('address', event.target.value)}
                            value={form.address}
                        />
                        <FieldError errors={errors} name="address" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Contact phone</span>
                        <input
                            maxLength={30}
                            onChange={(event) => change('phone', event.target.value)}
                            type="tel"
                            value={form.phone}
                        />
                        <FieldError errors={errors} name="phone" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Operational notes</span>
                        <textarea
                            maxLength={1000}
                            onChange={(event) => change('notes', event.target.value)}
                            rows={3}
                            value={form.notes}
                        />
                        <FieldError errors={errors} name="notes" />
                    </label>
                    <label className="ui-check form-grid__wide">
                        <input
                            checked={form.is_active}
                            onChange={(event) => change('is_active', event.target.checked)}
                            type="checkbox"
                        />
                        <span>
                            <strong>Active warehouse</strong>
                            <small>
                                Inactive warehouses remain in history but cannot be selected for new transactions.
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
