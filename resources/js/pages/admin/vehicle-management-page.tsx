import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    VehicleApiError,
    vehicleApi,
    type Vehicle,
    type VehicleFilters,
    type VehicleInput,
    type VehicleOptions,
    type VehicleSummary,
} from '../../services/vehicles';
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
const emptyOptions: VehicleOptions = { representatives: [], types: [] };
const emptySummary: VehicleSummary = { active: 0, assigned: 0, total: 0, unassigned: 0 };

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function VehicleManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Not available'));
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('vehicle.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('vehicle.edit'));
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [options, setOptions] = useState<VehicleOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Vehicle | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        assignment: '',
        search: '',
        status: '',
        type: '',
    });
    const [filters, setFilters] = useState<VehicleFilters>({
        page: 1,
    });

    const loadVehicles = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([vehicleApi.list(filters), vehicleApi.options()]);
            setVehicles(response.data);
            setMeta(response.meta);
            setSummary(response.summary ?? emptySummary);
            setOptions(availableOptions);
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [filters, t]);

    useEffect(() => {
        let active = true;
        void Promise.all([vehicleApi.list(filters), vehicleApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setVehicles(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
                setOptions(availableOptions);
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
        <div className="admin-page vehicle-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Master data')}</p>
                    <h1>{t('Vehicles')}</h1>
                    <p>{t('Maintain the delivery fleet and optional representative assignments.')}</p>
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
                        {t('New vehicle')}
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="truck"
                    label={t('Vehicles')}
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
                    icon="users"
                    label={t('Assigned')}
                    value={formatNumber(summary.assigned)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="adjustments"
                    label={t('Unassigned')}
                    value={formatNumber(summary.unassigned)}
                />
            </div>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="truck" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadVehicles()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel eyebrow={t('Fleet')} title={t('Vehicle directory')}>
                <form
                    className="filter-toolbar master-data-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setFilters({
                            assignment: draftFilters.assignment,
                            page: 1,
                            search: draftFilters.search,
                            status: draftFilters.status,
                            type: draftFilters.type,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">{t('Search vehicles')}</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={t('Search number, make, model, or representative')}
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
                    <label>
                        <span className="sr-only">{t('Filter by type')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    type: event.target.value,
                                }))
                            }
                            value={draftFilters.type}
                        >
                            <option value="">{t('All types')}</option>
                            {options.types.map((type) => (
                                <option key={type}>{type}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by assignment')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    assignment: event.target.value,
                                }))
                            }
                            value={draftFilters.assignment}
                        >
                            <option value="">{t('All assignments')}</option>
                            <option value="assigned">{t('Assigned')}</option>
                            <option value="unassigned">{t('Unassigned')}</option>
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        {t('Apply')}
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading vehicles…')}
                    </div>
                ) : vehicles.length === 0 ? (
                    <EmptyState
                        description={t('Change the filters or create the first fleet record.')}
                        title={t('No vehicles found')}
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table vehicle-table">
                            <thead>
                                <tr>
                                    <th>{t('Vehicle')}</th>
                                    <th>{t('Make / model')}</th>
                                    <th>{t('Representative')}</th>
                                    <th>{t('Notes')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Updated')}</th>
                                    {canEdit ? <th className="ui-table__actions">{t('Actions')}</th> : null}
                                </tr>
                            </thead>
                            <tbody>
                                {vehicles.map((vehicle) => (
                                    <tr key={vehicle.id}>
                                        <td>
                                            <strong>{vehicle.vehicle_number}</strong>
                                            <small>{vehicle.vehicle_type}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{vehicle.brand || t('Not specified')}</span>
                                            <small>{vehicle.model || t('No model recorded')}</small>
                                        </td>
                                        <td>
                                            {vehicle.representative ? (
                                                <>
                                                    <strong>{vehicle.representative.name}</strong>
                                                    <small>{vehicle.representative.code}</small>
                                                </>
                                            ) : (
                                                <span className="table-muted">{t('Unassigned')}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {vehicle.notes || t('No operational notes')}
                                            </span>
                                        </td>
                                        <td>
                                            <StatusBadge tone={vehicle.is_active ? 'success' : 'danger'}>
                                                {t(vehicle.is_active ? 'Active' : 'Inactive')}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(vehicle.updated_at)}</span>
                                            <small>{t('Created {date}', { date: dateTime(vehicle.created_at) })}</small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={t('Edit {name}', { name: vehicle.vehicle_number })}
                                                    onClick={() => {
                                                        setSelected(vehicle);
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
                        {t('{from}–{to} of {total} vehicles', {
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

            <VehicleDialog
                onClose={() => setDialogOpen(false)}
                onSaved={async (message) => {
                    setDialogOpen(false);
                    await loadVehicles();
                    showNotice(message);
                }}
                open={dialogOpen}
                options={options}
                vehicle={selected}
            />
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function VehicleDialog({
    onClose,
    onSaved,
    open,
    options,
    vehicle,
}: {
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: VehicleOptions;
    vehicle: Vehicle | null;
}) {
    const { t } = useLocale();
    const [form, setForm] = useState<VehicleInput>({
        brand: '',
        is_active: true,
        model: '',
        notes: '',
        sales_representative_id: null,
        vehicle_number: '',
        vehicle_type: 'Van',
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setErrors({});
        setForm({
            brand: vehicle?.brand ?? '',
            is_active: vehicle?.is_active ?? true,
            model: vehicle?.model ?? '',
            notes: vehicle?.notes ?? '',
            sales_representative_id: vehicle?.sales_representative_id ?? null,
            vehicle_number: vehicle?.vehicle_number ?? '',
            vehicle_type: vehicle?.vehicle_type ?? 'Van',
        });
    }, [open, vehicle]);

    const change = (field: keyof VehicleInput, value: boolean | number | null | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            vehicle?.is_active &&
            !form.is_active &&
            !window.confirm(
                t('Deactivate {number}? It will remain in history but cannot be selected for new operations.', {
                    number: vehicle.vehicle_number,
                }),
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (vehicle) await vehicleApi.update(vehicle.id, form);
            else await vehicleApi.create(form);
            await onSaved(t(vehicle ? 'Vehicle updated.' : 'Vehicle created.'));
        } catch (requestError) {
            if (requestError instanceof VehicleApiError) setErrors(requestError.fields);
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
            description={t('Vehicle numbers are unique. A representative can be assigned to only one vehicle.')}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        disabled={saving}
                        form="vehicle-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? t('Saving…') : t('Save vehicle')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={vehicle ? t('Edit vehicle · {number}', { number: vehicle.vehicle_number }) : t('Create vehicle')}
        >
            <form className="management-form" id="vehicle-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>{t('Vehicle number')}</span>
                        <input
                            autoFocus
                            maxLength={50}
                            onChange={(event) => change('vehicle_number', event.target.value.toUpperCase())}
                            placeholder="YGN-3N-4821"
                            required
                            value={form.vehicle_number}
                        />
                        <FieldError errors={errors} name="vehicle_number" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Vehicle type')}</span>
                        <input
                            list="vehicle-type-options"
                            maxLength={50}
                            onChange={(event) => change('vehicle_type', event.target.value)}
                            placeholder={t('Van')}
                            required
                            value={form.vehicle_type}
                        />
                        <datalist id="vehicle-type-options">
                            {options.types.map((type) => (
                                <option key={type} value={type} />
                            ))}
                        </datalist>
                        <FieldError errors={errors} name="vehicle_type" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Brand')}</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('brand', event.target.value)}
                            placeholder={t('Toyota')}
                            value={form.brand}
                        />
                        <FieldError errors={errors} name="brand" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Model')}</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('model', event.target.value)}
                            placeholder={t('Hiace')}
                            value={form.model}
                        />
                        <FieldError errors={errors} name="model" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Assigned representative')}</span>
                        <select
                            onChange={(event) =>
                                change(
                                    'sales_representative_id',
                                    event.target.value ? Number(event.target.value) : null,
                                )
                            }
                            value={form.sales_representative_id ?? ''}
                        >
                            <option value="">{t('Unassigned')}</option>
                            {options.representatives.map((representative) => (
                                <option
                                    disabled={Boolean(
                                        representative.vehicle_id && representative.vehicle_id !== vehicle?.id,
                                    )}
                                    key={representative.id}
                                    value={representative.id}
                                >
                                    {representative.name} · {representative.code}
                                    {representative.vehicle_id && representative.vehicle_id !== vehicle?.id
                                        ? t(' · already assigned')
                                        : ''}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="sales_representative_id" />
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
                            <strong>{t('Active vehicle')}</strong>
                            <small>
                                {t('Inactive vehicles remain in history but cannot be selected for new operations.')}
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
