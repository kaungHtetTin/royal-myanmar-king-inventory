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
} from '../../services/vehicles';
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
const emptyOptions: VehicleOptions = { representatives: [], types: [] };

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

export function VehicleManagementPage() {
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('vehicle.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('vehicle.edit'));
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [options, setOptions] = useState<VehicleOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Vehicle | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        assignment: '',
        search: '',
        sort: 'vehicle_number:asc',
        status: '',
        type: '',
    });
    const [filters, setFilters] = useState<VehicleFilters>({
        direction: 'asc',
        page: 1,
        sort: 'vehicle_number',
    });

    const loadVehicles = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([vehicleApi.list(filters), vehicleApi.options()]);
            setVehicles(response.data);
            setMeta(response.meta);
            setOptions(availableOptions);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        let active = true;
        void Promise.all([vehicleApi.list(filters), vehicleApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setVehicles(response.data);
                setMeta(response.meta);
                setOptions(availableOptions);
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

    const activeCount = vehicles.filter((vehicle) => vehicle.is_active).length;
    const assignedCount = vehicles.filter((vehicle) => vehicle.representative).length;
    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="admin-page vehicle-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Master data</p>
                    <h1>Vehicles</h1>
                    <p>Maintain the delivery fleet and optional representative assignments.</p>
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
                        New vehicle
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard hint="Current filtered result" icon="truck" label="Vehicles" value={String(meta.total)} />
                <MetricCard hint="On this page" icon="dashboard" label="Active" value={String(activeCount)} />
                <MetricCard hint="On this page" icon="users" label="Assigned" value={String(assignedCount)} />
                <MetricCard
                    hint="On this page"
                    icon="adjustments"
                    label="Unassigned"
                    value={String(vehicles.length - assignedCount)}
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
                        Retry
                    </button>
                </div>
            ) : null}

            <Panel eyebrow="Fleet" title="Vehicle directory">
                <form
                    className="filter-toolbar master-data-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const [sort, direction] = draftFilters.sort.split(':') as [string, 'asc' | 'desc'];
                        setLoading(true);
                        setFilters({
                            assignment: draftFilters.assignment,
                            direction,
                            page: 1,
                            search: draftFilters.search,
                            sort,
                            status: draftFilters.status,
                            type: draftFilters.type,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">Search vehicles</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder="Search number, make, model, or representative"
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
                    <label>
                        <span className="sr-only">Filter by type</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    type: event.target.value,
                                }))
                            }
                            value={draftFilters.type}
                        >
                            <option value="">All types</option>
                            {options.types.map((type) => (
                                <option key={type}>{type}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">Filter by assignment</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    assignment: event.target.value,
                                }))
                            }
                            value={draftFilters.assignment}
                        >
                            <option value="">All assignments</option>
                            <option value="assigned">Assigned</option>
                            <option value="unassigned">Unassigned</option>
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">Sort vehicles</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    sort: event.target.value,
                                }))
                            }
                            value={draftFilters.sort}
                        >
                            <option value="vehicle_number:asc">Number A-Z</option>
                            <option value="vehicle_number:desc">Number Z-A</option>
                            <option value="vehicle_type:asc">Type A-Z</option>
                            <option value="brand:asc">Brand A-Z</option>
                            <option value="created_at:desc">Newest first</option>
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        Loading vehicles…
                    </div>
                ) : vehicles.length === 0 ? (
                    <EmptyState
                        description="Change the filters or create the first fleet record."
                        title="No vehicles found"
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table vehicle-table">
                            <thead>
                                <tr>
                                    <th>Vehicle</th>
                                    <th>Make / model</th>
                                    <th>Representative</th>
                                    <th>Notes</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    {canEdit ? <th className="ui-table__actions">Actions</th> : null}
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
                                            <span className="table-primary">{vehicle.brand || 'Not specified'}</span>
                                            <small>{vehicle.model || 'No model recorded'}</small>
                                        </td>
                                        <td>
                                            {vehicle.representative ? (
                                                <>
                                                    <strong>{vehicle.representative.name}</strong>
                                                    <small>{vehicle.representative.code}</small>
                                                </>
                                            ) : (
                                                <span className="table-muted">Unassigned</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {vehicle.notes || 'No operational notes'}
                                            </span>
                                        </td>
                                        <td>
                                            <StatusBadge tone={vehicle.is_active ? 'success' : 'danger'}>
                                                {vehicle.is_active ? 'Active' : 'Inactive'}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(vehicle.updated_at)}</span>
                                            <small>Created {dateTime(vehicle.created_at)}</small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={`Edit ${vehicle.vehicle_number}`}
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
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} vehicles
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
                `Deactivate ${vehicle.vehicle_number}? It will remain in history but cannot be selected for new operations.`,
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (vehicle) await vehicleApi.update(vehicle.id, form);
            else await vehicleApi.create(form);
            await onSaved(vehicle ? 'Vehicle updated.' : 'Vehicle created.');
        } catch (requestError) {
            if (requestError instanceof VehicleApiError) setErrors(requestError.fields);
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
            description="Vehicle numbers are unique. A representative can be assigned to only one vehicle."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={saving}
                        form="vehicle-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save vehicle'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={vehicle ? `Edit vehicle · ${vehicle.vehicle_number}` : 'Create vehicle'}
        >
            <form className="management-form" id="vehicle-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Vehicle number</span>
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
                        <span>Vehicle type</span>
                        <input
                            list="vehicle-type-options"
                            maxLength={50}
                            onChange={(event) => change('vehicle_type', event.target.value)}
                            placeholder="Van"
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
                        <span>Brand</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('brand', event.target.value)}
                            placeholder="Toyota"
                            value={form.brand}
                        />
                        <FieldError errors={errors} name="brand" />
                    </label>
                    <label className="ui-field">
                        <span>Model</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('model', event.target.value)}
                            placeholder="Hiace"
                            value={form.model}
                        />
                        <FieldError errors={errors} name="model" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Assigned representative</span>
                        <select
                            onChange={(event) =>
                                change(
                                    'sales_representative_id',
                                    event.target.value ? Number(event.target.value) : null,
                                )
                            }
                            value={form.sales_representative_id ?? ''}
                        >
                            <option value="">Unassigned</option>
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
                                        ? ' · already assigned'
                                        : ''}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="sales_representative_id" />
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
                            <strong>Active vehicle</strong>
                            <small>
                                Inactive vehicles remain in history but cannot be selected for new operations.
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
