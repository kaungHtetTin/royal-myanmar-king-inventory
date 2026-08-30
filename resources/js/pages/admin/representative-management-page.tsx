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
import { useLocale } from '../../localization/locale-context';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptyOptions: RepresentativeOptions = { vehicles: [], warehouses: [], regions: [] };
const emptySummary: RepresentativeSummary = { active: 0, signed_in: 0, total: 0, with_vehicle: 0 };
function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function RepresentativeManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Never'));
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
            setError(errorMessage(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [filters, t]);

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
        <div className="admin-page representative-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Master data')}</p>
                    <h1>{t('Representatives')}</h1>
                    <p>
                        {t('Maintain representative profiles, login accounts, warehouse ownership, and vehicle links.')}
                    </p>
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
                        {t('New representative')}
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="users"
                    label={t('Representatives')}
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
                    icon="truck"
                    label={t('With vehicle')}
                    value={formatNumber(summary.with_vehicle)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="logout"
                    label={t('Have signed in')}
                    value={formatNumber(summary.signed_in)}
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
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel eyebrow={t('Field team')} title={t('Representative directory')}>
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
                        <span className="sr-only">{t('Search representatives')}</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={t('Search code, name, username, phone, or region')}
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
                        <span className="sr-only">{t('Filter by warehouse')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    warehouse_id: event.target.value,
                                }))
                            }
                            value={draftFilters.warehouse_id}
                        >
                            <option value="">{t('All warehouses')}</option>
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.code}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by vehicle')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    vehicle: event.target.value,
                                }))
                            }
                            value={draftFilters.vehicle}
                        >
                            <option value="">{t('All vehicles')}</option>
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
                        {t('Loading representatives…')}
                    </div>
                ) : representatives.length === 0 ? (
                    <EmptyState
                        description={t('Change the filters or create the first field representative.')}
                        title={t('No representatives found')}
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table representative-table">
                            <thead>
                                <tr>
                                    <th>{t('Representative')}</th>
                                    <th>{t('Login account')}</th>
                                    <th>{t('Warehouse / region')}</th>
                                    <th>{t('Vehicle')}</th>
                                    <th>{t('Contact')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Updated')}</th>
                                    {canEdit ? <th className="ui-table__actions">{t('Actions')}</th> : null}
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
                                            <small>
                                                {t('Last login: {date}', {
                                                    date: dateTime(representative.account.last_login_at),
                                                })}
                                            </small>
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
                                                <span className="table-muted">{t('Unassigned')}</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {representative.phone || t('Not specified')}
                                            </span>
                                            <small>{representative.email || t('No email')}</small>
                                        </td>
                                        <td>
                                            <StatusBadge tone={representative.is_active ? 'success' : 'danger'}>
                                                {t(representative.is_active ? 'Active' : 'Inactive')}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(representative.updated_at)}</span>
                                            <small>
                                                {t('Created {date}', { date: dateTime(representative.created_at) })}
                                            </small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={t('Edit {name}', { name: representative.name })}
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
                        {t('{from}–{to} of {total} representatives', {
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
    const { t } = useLocale();
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
        region_ids: [],
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
            region_ids: representative?.region_ids ?? [],
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
            !window.confirm(
                t('Deactivate {name}? Their sales login will stop immediately.', { name: representative.name }),
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            const payload = {
                ...form,
                region: (options.regions ?? []).find((region) => form.region_ids.includes(region.id))?.name ?? '',
            };
            if (representative) await representativeApi.update(representative.id, payload);
            else await representativeApi.create(payload);
            await onSaved(t(representative ? 'Representative updated.' : 'Representative created.'));
        } catch (requestError) {
            if (requestError instanceof RepresentativeApiError) setErrors(requestError.fields);
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
            description={t(
                'The profile and sales login are saved together. The representative code is generated automatically.',
            )}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        disabled={saving}
                        form="representative-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? t('Saving…') : t('Save representative')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={
                representative
                    ? t('Edit representative · {code}', { code: representative.code })
                    : t('Create representative')
            }
        >
            <form className="management-form" id="representative-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    {representative ? (
                        <label className="ui-field">
                            <span>{t('Representative code')}</span>
                            <input disabled value={form.code} />
                        </label>
                    ) : null}
                    <label className="ui-field">
                        <span>{t('Full name')}</span>
                        <input
                            autoFocus
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Username')}</span>
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
                        <span>{t('Email (optional)')}</span>
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
                            {representative
                                ? t('New password (optional, minimum 6 characters)')
                                : t('Password (minimum 6 characters)')}
                        </span>
                        <input
                            autoComplete="new-password"
                            minLength={6}
                            onChange={(event) => change('password', event.target.value)}
                            required={!representative}
                            type="password"
                            value={form.password}
                        />
                        <FieldError errors={errors} name="password" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Confirm password')}</span>
                        <input
                            autoComplete="new-password"
                            minLength={6}
                            onChange={(event) => change('password_confirmation', event.target.value)}
                            required={!representative || Boolean(form.password)}
                            type="password"
                            value={form.password_confirmation}
                        />
                    </label>
                    <label className="ui-field">
                        <span>{t('Primary warehouse')}</span>
                        <select
                            onChange={(event) =>
                                setForm((value) => ({
                                    ...value,
                                    primary_warehouse_id: Number(event.target.value),
                                    region_ids: [],
                                }))
                            }
                            required
                            value={form.primary_warehouse_id}
                        >
                            <option disabled value={0}>
                                {t('Select warehouse')}
                            </option>
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name} · {warehouse.code}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="primary_warehouse_id" />
                    </label>
                    <fieldset className="region-assignment form-grid__wide">
                        <legend>{t('Assigned regions')}</legend>
                        <small>{t('The representative may sell to customers within the selected regions.')}</small>
                        <div className="region-assignment__grid">
                            {(options.regions ?? [])
                                .filter((region) => region.warehouse_id === form.primary_warehouse_id)
                                .map((region) => (
                                    <label className="ui-check" key={region.id}>
                                        <input
                                            checked={form.region_ids.includes(region.id)}
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    region_ids: event.target.checked
                                                        ? [...value.region_ids, region.id]
                                                        : value.region_ids.filter((id) => id !== region.id),
                                                }))
                                            }
                                            type="checkbox"
                                        />
                                        <span>
                                            <strong>{region.name}</strong>
                                            <small>{region.warehouse.code}</small>
                                        </span>
                                    </label>
                                ))}
                        </div>
                        <FieldError errors={errors} name="region_ids" />
                    </fieldset>
                    <label className="ui-field">
                        <span>{t('Phone')}</span>
                        <input
                            maxLength={50}
                            onChange={(event) => change('phone', event.target.value)}
                            type="tel"
                            value={form.phone}
                        />
                        <FieldError errors={errors} name="phone" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Vehicle (optional)')}</span>
                        <select
                            onChange={(event) =>
                                change('vehicle_id', event.target.value ? Number(event.target.value) : null)
                            }
                            value={form.vehicle_id ?? ''}
                        >
                            <option value="">{t('Unassigned')}</option>
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
                                        ? t(' · already assigned')
                                        : ''}
                                </option>
                            ))}
                        </select>
                        <FieldError errors={errors} name="vehicle_id" />
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Notes')}</span>
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
                            <strong>{t('Active representative and login')}</strong>
                            <small>
                                {t('Turning this off preserves history and immediately blocks sales-portal access.')}
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
