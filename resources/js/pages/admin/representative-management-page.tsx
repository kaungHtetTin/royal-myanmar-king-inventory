import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    RepresentativeApiError,
    representativeApi,
    type Representative,
    type RepresentativeFilters,
    type RepresentativeInput,
    type RepresentativeOptions,
    type RepresentativeSummary,
} from '../../services/representatives';
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
const emptyOptions: RepresentativeOptions = { vehicles: [], warehouses: [] };
const emptySummary: RepresentativeSummary = { active: 0, signed_in: 0, total: 0, with_vehicle: 0 };
function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}
function dateTime(value: string | null) {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

export function RepresentativeManagementPage() {
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('representative.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('representative.edit'));
    const [representatives, setRepresentatives] = useState<Representative[]>([]);
    const [options, setOptions] = useState<RepresentativeOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Representative | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        search: '',
        status: '',
        vehicle: '',
        warehouse_id: '',
    });
    const [filters, setFilters] = useState<RepresentativeFilters>({
        page: 1,
    });

    const loadRepresentatives = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([
                representativeApi.list(filters),
                representativeApi.options(),
            ]);
            setRepresentatives(response.data);
            setMeta(response.meta);
            setSummary(response.summary ?? emptySummary);
            setOptions(availableOptions);
        } catch (requestError) {
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        let active = true;
        void Promise.all([representativeApi.list(filters), representativeApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setRepresentatives(response.data);
                setMeta(response.meta);
                setSummary(response.summary ?? emptySummary);
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

    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="admin-page representative-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Master data</p>
                    <h1>Representatives</h1>
                    <p>Maintain representative profiles, login accounts, warehouse ownership, and vehicle links.</p>
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
                        New representative
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Current filtered result"
                    icon="users"
                    label="Representatives"
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
                    icon="truck"
                    label="With vehicle"
                    value={String(summary.with_vehicle)}
                />
                <MetricCard
                    hint="Current filtered result"
                    icon="logout"
                    label="Have signed in"
                    value={String(summary.signed_in)}
                />
            </div>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="users" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadRepresentatives()} type="button">
                        Retry
                    </button>
                </div>
            ) : null}

            <Panel eyebrow="Field team" title="Representative directory">
                <form
                    className="filter-toolbar representative-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setFilters({
                            page: 1,
                            search: draftFilters.search,
                            status: draftFilters.status,
                            vehicle: draftFilters.vehicle,
                            warehouse_id: draftFilters.warehouse_id,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">Search representatives</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder="Search code, name, username, phone, or region"
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
                        <span className="sr-only">Filter by warehouse</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    warehouse_id: event.target.value,
                                }))
                            }
                            value={draftFilters.warehouse_id}
                        >
                            <option value="">All warehouses</option>
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.code}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">Filter by vehicle</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    vehicle: event.target.value,
                                }))
                            }
                            value={draftFilters.vehicle}
                        >
                            <option value="">All vehicles</option>
                            <option value="assigned">Assigned</option>
                            <option value="unassigned">Unassigned</option>
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        Loading representatives…
                    </div>
                ) : representatives.length === 0 ? (
                    <EmptyState
                        description="Change the filters or create the first field representative."
                        title="No representatives found"
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table representative-table">
                            <thead>
                                <tr>
                                    <th>Representative</th>
                                    <th>Login account</th>
                                    <th>Warehouse / region</th>
                                    <th>Vehicle</th>
                                    <th>Contact</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    {canEdit ? <th className="ui-table__actions">Actions</th> : null}
                                </tr>
                            </thead>
                            <tbody>
                                {representatives.map((representative) => (
                                    <tr key={representative.id}>
                                        <td>
                                            <Link
                                                className="table-identity-link"
                                                to={`/admin/representatives/${representative.id}`}
                                            >
                                                {representative.name}
                                            </Link>
                                            <small>{representative.code}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">@{representative.account.username}</span>
                                            <small>Last login: {dateTime(representative.account.last_login_at)}</small>
                                        </td>
                                        <td>
                                            <strong>{representative.primary_warehouse.name}</strong>
                                            <small>
                                                {representative.region || representative.primary_warehouse.code}
                                            </small>
                                        </td>
                                        <td>
                                            {representative.vehicle ? (
                                                <>
                                                    <strong>{representative.vehicle.vehicle_number}</strong>
                                                    <small>{representative.vehicle.vehicle_type}</small>
                                                </>
                                            ) : (
                                                <span className="table-muted">Unassigned</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {representative.phone || 'Not specified'}
                                            </span>
                                            <small>{representative.email || 'No email'}</small>
                                        </td>
                                        <td>
                                            <StatusBadge tone={representative.is_active ? 'success' : 'danger'}>
                                                {representative.is_active ? 'Active' : 'Inactive'}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(representative.updated_at)}</span>
                                            <small>Created {dateTime(representative.created_at)}</small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={`Edit ${representative.name}`}
                                                    onClick={() => {
                                                        setSelected(representative);
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
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} representatives
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

            <RepresentativeDialog
                onClose={() => setDialogOpen(false)}
                onSaved={async (message) => {
                    setDialogOpen(false);
                    await loadRepresentatives();
                    showNotice(message);
                }}
                open={dialogOpen}
                options={options}
                representative={selected}
            />
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function RepresentativeDialog({
    onClose,
    onSaved,
    open,
    options,
    representative,
}: {
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: RepresentativeOptions;
    representative: Representative | null;
}) {
    const [form, setForm] = useState<RepresentativeInput>({
        code: '',
        email: '',
        is_active: true,
        name: '',
        notes: '',
        password: '',
        password_confirmation: '',
        phone: '',
        primary_warehouse_id: 0,
        region: '',
        username: '',
        vehicle_id: null,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setErrors({});
        setForm({
            code: representative?.code ?? '',
            email: representative?.email ?? '',
            is_active: representative?.is_active ?? true,
            name: representative?.name ?? '',
            notes: representative?.notes ?? '',
            password: '',
            password_confirmation: '',
            phone: representative?.phone ?? '',
            primary_warehouse_id: representative?.primary_warehouse_id ?? options.warehouses[0]?.id ?? 0,
            region: representative?.region ?? '',
            username: representative?.account.username ?? '',
            vehicle_id: representative?.vehicle?.id ?? null,
        });
    }, [open, options.warehouses, representative]);

    const change = (field: keyof RepresentativeInput, value: boolean | number | null | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            representative?.is_active &&
            !form.is_active &&
            !window.confirm(`Deactivate ${representative.name}? Their sales login will stop immediately.`)
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (representative) await representativeApi.update(representative.id, form);
            else await representativeApi.create(form);
            await onSaved(representative ? 'Representative updated.' : 'Representative created.');
        } catch (requestError) {
            if (requestError instanceof RepresentativeApiError) setErrors(requestError.fields);
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
            description="The profile and sales login are saved together. Username and representative code must be unique."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={saving}
                        form="representative-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save representative'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={representative ? `Edit representative · ${representative.code}` : 'Create representative'}
        >
            <form className="management-form" id="representative-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Representative code</span>
                        <input
                            autoFocus
                            maxLength={30}
                            onChange={(event) => change('code', event.target.value.toUpperCase())}
                            placeholder="SR-001"
                            required
                            value={form.code}
                        />
                        <FieldError errors={errors} name="code" />
                    </label>
                    <label className="ui-field">
                        <span>Full name</span>
                        <input
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field">
                        <span>Username</span>
                        <input
                            autoComplete="username"
                            maxLength={100}
                            onChange={(event) => change('username', event.target.value.toLowerCase())}
                            required
                            value={form.username}
                        />
                        <FieldError errors={errors} name="username" />
                    </label>
                    <label className="ui-field">
                        <span>Email (optional)</span>
                        <input
                            maxLength={255}
                            onChange={(event) => change('email', event.target.value)}
                            type="email"
                            value={form.email}
                        />
                        <FieldError errors={errors} name="email" />
                    </label>
                    <label className="ui-field">
                        <span>
                            {representative ? 'New password (optional, 8 characters)' : 'Password (8 characters)'}
                        </span>
                        <input
                            autoComplete="new-password"
                            maxLength={8}
                            minLength={8}
                            onChange={(event) => change('password', event.target.value)}
                            required={!representative}
                            type="password"
                            value={form.password}
                        />
                        <FieldError errors={errors} name="password" />
                    </label>
                    <label className="ui-field">
                        <span>Confirm password</span>
                        <input
                            autoComplete="new-password"
                            maxLength={8}
                            minLength={8}
                            onChange={(event) => change('password_confirmation', event.target.value)}
                            required={!representative || Boolean(form.password)}
                            type="password"
                            value={form.password_confirmation}
                        />
                    </label>
                    <label className="ui-field">
                        <span>Primary warehouse</span>
                        <select
                            onChange={(event) => change('primary_warehouse_id', Number(event.target.value))}
                            required
                            value={form.primary_warehouse_id}
                        >
                            <option disabled value={0}>
                                Select warehouse
                            </option>
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name} · {warehouse.code}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="primary_warehouse_id" />
                    </label>
                    <label className="ui-field">
                        <span>Operating region</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('region', event.target.value)}
                            value={form.region}
                        />
                        <FieldError errors={errors} name="region" />
                    </label>
                    <label className="ui-field">
                        <span>Phone</span>
                        <input
                            maxLength={50}
                            onChange={(event) => change('phone', event.target.value)}
                            type="tel"
                            value={form.phone}
                        />
                        <FieldError errors={errors} name="phone" />
                    </label>
                    <label className="ui-field">
                        <span>Vehicle (optional)</span>
                        <select
                            onChange={(event) =>
                                change('vehicle_id', event.target.value ? Number(event.target.value) : null)
                            }
                            value={form.vehicle_id ?? ''}
                        >
                            <option value="">Unassigned</option>
                            {options.vehicles.map((vehicle) => (
                                <option
                                    disabled={Boolean(
                                        vehicle.sales_representative_id &&
                                        vehicle.sales_representative_id !== representative?.id,
                                    )}
                                    key={vehicle.id}
                                    value={vehicle.id}
                                >
                                    {vehicle.vehicle_number} · {vehicle.vehicle_type}
                                    {vehicle.sales_representative_id &&
                                    vehicle.sales_representative_id !== representative?.id
                                        ? ' · already assigned'
                                        : ''}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="vehicle_id" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Notes</span>
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
                            <strong>Active representative and login</strong>
                            <small>
                                Turning this off preserves history and immediately blocks sales-portal access.
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
