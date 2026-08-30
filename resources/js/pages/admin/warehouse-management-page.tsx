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
} from '../../services/warehouses';
import { Icon } from '../../ui/icons';
import { Button, Dialog, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptySummary: WarehouseSummary = { active: 0, assigned_users: 0, inactive: 0, total: 0 };

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function WarehouseManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Not available'));
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
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [filters, t]);

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
                if (active) setError(errorMessage(requestError, t('Unable to complete the request.')));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filters, t]);

    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="admin-page warehouse-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Master data')}</p>
                    <h1>{t('Warehouses')}</h1>
                    <p>{t('Maintain operational locations and warehouse availability.')}</p>
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
                        {t('New warehouse')}
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="warehouse"
                    label={t('Warehouses')}
                    value={formatNumber(summary.total)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="dashboard"
                    label={t('Active')}
                    value={formatNumber(summary.active)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="adjustments"
                    label={t('Inactive')}
                    value={formatNumber(summary.inactive)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="users"
                    label={t('Assigned users')}
                    value={formatNumber(summary.assigned_users)}
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
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel eyebrow={t('Locations')} title={t('Warehouse directory')}>
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
                        <span className="sr-only">{t('Search warehouses')}</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={t('Search code, name, or address')}
                            type="search"
                            value={draftFilters.search}
                        />
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by status')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    status: event.target.value,
                                }))
                            }
                            value={draftFilters.status}
                        >
                            <option value="">{t('All statuses')}</option>
                            <option value="active">{t('Active')}</option>
                            <option value="inactive">{t('Inactive')}</option>
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        {t('Apply filters')}
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading warehouses…')}
                    </div>
                ) : warehouses.length === 0 ? (
                    <EmptyState
                        description={t('Change the filters or create the first operational location.')}
                        title={t('No warehouses found')}
                    />
                ) : (
                    <div className="ui-table-wrap warehouse-table-wrap">
                        <table className="ui-table warehouse-table">
                            <thead>
                                <tr>
                                    <th>{t('Warehouse')}</th>
                                    <th>{t('Address')}</th>
                                    <th>{t('Contact')}</th>
                                    <th>{t('Assigned users')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Updated')}</th>
                                    {canEdit ? <th className="ui-table__actions">{t('Actions')}</th> : null}
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
                                            <strong>{warehouse.address || t('No address recorded')}</strong>
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {warehouse.phone || t('Not specified')}
                                            </span>
                                            <small>{warehouse.notes || t('No operational notes')}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{formatNumber(warehouse.users_count)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={warehouse.is_active ? 'success' : 'danger'}>
                                                {t(warehouse.is_active ? 'Active' : 'Inactive')}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(warehouse.updated_at)}</span>
                                            <small>
                                                {t('Created {date}', { date: dateTime(warehouse.created_at) })}
                                            </small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <Link
                                                    aria-label={t('Open settings for {name}', { name: warehouse.name })}
                                                    className="ui-icon-button ui-icon-button--secondary"
                                                    title={t('Open settings for {name}', { name: warehouse.name })}
                                                    to={`/admin/warehouses/${warehouse.id}/settings`}
                                                >
                                                    <Icon name="warehouse" />
                                                </Link>
                                                <IconButton
                                                    icon="settings"
                                                    label={t('Edit {name}', { name: warehouse.name })}
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
                        {t('{from}–{to} of {total} warehouses', {
                            from: formatNumber(meta.from ?? 0),
                            to: formatNumber(meta.to ?? 0),
                            total: formatNumber(meta.total),
                        })}
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
                        {t('Previous')}
                    </button>
                    <strong>
                        {t('Page {current} of {last}', {
                            current: formatNumber(meta.current_page),
                            last: formatNumber(meta.last_page),
                        })}
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
                        {t('Next')}
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
    const { t } = useLocale();
    const [regionName, setRegionName] = useState('');
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
            setMessage(errorMessage(error, t('Unable to complete the request.')));
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
            t('Region updated.'),
        );
    return (
        <Dialog
            description={t('Representatives and customers are assigned directly to regions.')}
            footer={
                <Button onClick={onClose} tone="secondary">
                    {t('Close')}
                </Button>
            }
            onClose={onClose}
            open
            title={t('Coverage · {warehouse}', { warehouse: warehouse.name })}
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
                            t('Region created.'),
                        ).then(() => setRegionName(''));
                    }}
                >
                    <label className="ui-field">
                        <span>{t('New region name')}</span>
                        <input
                            disabled={busy}
                            onChange={(event) => setRegionName(event.target.value)}
                            placeholder={t('Enter region name')}
                            value={regionName}
                        />
                    </label>
                    <Button disabled={busy || !regionName.trim()} icon="plus" type="submit">
                        {t('Add region')}
                    </Button>
                </form>
                <div className="coverage-manager__regions">
                    {warehouse.regions.map((region) => (
                        <section className="coverage-region" key={region.id}>
                            <header>
                                <CoverageNameEditor
                                    busy={busy}
                                    key={`${region.id}-${region.name}`}
                                    label={t('Region name')}
                                    name={region.name}
                                    onSave={(name) => updateRegion(region, { name })}
                                    supportingText={t('Customer and representative coverage')}
                                />
                                <Button
                                    disabled={busy}
                                    onClick={() => void updateRegion(region, { is_active: !region.is_active })}
                                    tone="secondary"
                                >
                                    {t(region.is_active ? 'Deactivate' : 'Activate')}
                                </Button>
                            </header>
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
    const { t } = useLocale();
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
                    {t('Save')}
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
    const { t } = useLocale();
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
            !window.confirm(
                t('Deactivate {name}? It will no longer be available for new transactions.', { name: warehouse.name }),
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (warehouse) await warehouseApi.update(warehouse.id, form);
            else await warehouseApi.create(form);
            await onSaved(t(warehouse ? 'Warehouse updated.' : 'Warehouse created.'));
        } catch (requestError) {
            if (requestError instanceof WarehouseApiError) setErrors(requestError.fields);
            setErrors((current) => ({
                ...current,
                form: [errorMessage(requestError, t('Unable to complete the request.'))],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            description={t('Warehouse codes identify stock locations and cannot contain spaces.')}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        disabled={saving}
                        form="warehouse-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? t('Saving…') : t('Save warehouse')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={warehouse ? t('Edit warehouse · {code}', { code: warehouse.code }) : t('Create warehouse')}
        >
            <form className="management-form" id="warehouse-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>{t('Warehouse code')}</span>
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
                        <span>{t('Warehouse name')}</span>
                        <input
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Address')}</span>
                        <input
                            maxLength={500}
                            onChange={(event) => change('address', event.target.value)}
                            value={form.address}
                        />
                        <FieldError errors={errors} name="address" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Contact phone')}</span>
                        <input
                            maxLength={30}
                            onChange={(event) => change('phone', event.target.value)}
                            type="tel"
                            value={form.phone}
                        />
                        <FieldError errors={errors} name="phone" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Operational notes')}</span>
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
                            <strong>{t('Active warehouse')}</strong>
                            <small>
                                {t(
                                    'Inactive warehouses remain in history but cannot be selected for new transactions.',
                                )}
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
