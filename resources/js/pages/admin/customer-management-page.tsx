import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    CustomerApiError,
    customerApi,
    type Customer,
    type CustomerFilters,
    type CustomerInput,
    type CustomerOptions,
    type CustomerSummary,
} from '../../services/customers';
import { Icon } from '../../ui/icons';
import { editableNumber } from '../../ui/form-values';
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
const emptyOptions: CustomerOptions = { types: [], warehouses: [], regions: [] };
const emptySummary: CustomerSummary = { active: 0, credit_enabled: 0, credit_limit: 0, total: 0 };

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function CustomerManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Not available'));
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('customer.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('customer.edit'));
    const canCredit = Boolean(isSuperAdmin || user?.permissions.includes('customer.credit_manage'));
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [options, setOptions] = useState<CustomerOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Customer | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        region_id: '',
        search: '',
        warehouse_id: '',
    });
    const [filters, setFilters] = useState<CustomerFilters>({
        page: 1,
    });

    const loadCustomers = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([customerApi.list(filters), customerApi.options()]);
            setCustomers(response.data);
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
        void Promise.all([customerApi.list(filters), customerApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setCustomers(response.data);
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
        <div className="admin-page customer-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Master data')}</p>
                    <h1>{t('Customers')}</h1>
                    <p>
                        {t('Maintain customer profiles, operating warehouse, and office-controlled credit settings.')}
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
                        {t('New customer')}
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="customers"
                    label={t('Customers')}
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
                    icon="cash"
                    label={t('Credit enabled')}
                    value={formatNumber(summary.credit_enabled)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="reports"
                    label={t('Credit limits')}
                    value={money(summary.credit_limit)}
                />
            </div>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="customers" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadCustomers()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel eyebrow={t('Directory')} title={t('Customer accounts')}>
                <form
                    className="filter-toolbar customer-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setFilters({
                            page: 1,
                            region_id: draftFilters.region_id,
                            search: draftFilters.search || undefined,
                            warehouse_id: draftFilters.warehouse_id,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">{t('Search customers')}</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) => setDraftFilters((value) => ({ ...value, search: event.target.value }))}
                            placeholder={t('Search code, name, phone, or location')}
                            type="search"
                            value={draftFilters.search}
                        />
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by warehouse')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    region_id: '',
                                    warehouse_id: event.target.value,
                                }))
                            }
                            value={draftFilters.warehouse_id}
                        >
                            <option value="">{t('All warehouses')}</option>
                            {options.warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.name} · {warehouse.code}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by region')}</span>
                        <select
                            disabled={!draftFilters.warehouse_id}
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    region_id: event.target.value,
                                }))
                            }
                            value={draftFilters.region_id}
                        >
                            <option value="">{t('All regions')}</option>
                            {(options.regions ?? [])
                                .filter((region) => String(region.warehouse_id) === draftFilters.warehouse_id)
                                .map((region) => (
                                    <option key={region.id} value={region.id}>
                                        {region.name}
                                    </option>
                                ))}
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        {t('Apply')}
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading customers…')}
                    </div>
                ) : customers.length === 0 ? (
                    <EmptyState
                        description={t('Change the filters or create the first customer account.')}
                        title={t('No customers found')}
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table customer-table">
                            <thead>
                                <tr>
                                    <th>{t('Customer')}</th>
                                    <th>{t('Type / location')}</th>
                                    <th>{t('Contact')}</th>
                                    <th>{t('Warehouse')}</th>
                                    <th className="is-numeric">{t('Credit')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Updated')}</th>
                                    {canEdit || canCredit ? (
                                        <th className="ui-table__actions">{t('Actions')}</th>
                                    ) : null}
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map((customer) => (
                                    <tr key={customer.id}>
                                        <td>
                                            <Link
                                                className="table-identity-link"
                                                to={`/admin/customers/${customer.id}`}
                                            >
                                                {customer.name}
                                            </Link>
                                            <small>{customer.code}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {customer.customer_type || t('Not specified')}
                                            </span>
                                            <small>
                                                {[customer.township, customer.region?.name].filter(Boolean).join(', ') ||
                                                    t('No location')}
                                            </small>
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {customer.phone || t('Not specified')}
                                            </span>
                                            <small>{customer.address || t('No address recorded')}</small>
                                        </td>
                                        <td>
                                            <strong>{customer.warehouse.name}</strong>
                                            <small>{customer.warehouse.code}</small>
                                        </td>
                                        <td className="is-numeric">
                                            {customer.credit_allowed ? (
                                                <>
                                                    <strong>{money(customer.credit_limit)}</strong>
                                                    <small>{t('Credit enabled')}</small>
                                                </>
                                            ) : (
                                                <span className="table-muted">{t('Cash only')}</span>
                                            )}
                                        </td>
                                        <td>
                                            <StatusBadge tone={customer.is_active ? 'success' : 'danger'}>
                                                {t(customer.is_active ? 'Active' : 'Inactive')}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(customer.updated_at)}</span>
                                            <small>
                                                {t('Created {date}', { date: dateTime(customer.created_at) })}
                                            </small>
                                        </td>
                                        {canEdit || canCredit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={t('{action} {name}', {
                                                        action: t(canEdit ? 'Edit' : 'Manage credit for'),
                                                        name: customer.name,
                                                    })}
                                                    onClick={() => {
                                                        setSelected(customer);
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
                        {t('{from}–{to} of {total} customers', {
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

            <CustomerDialog
                canCredit={canCredit}
                canEdit={canEdit}
                customer={selected}
                onClose={() => setDialogOpen(false)}
                onSaved={async (message) => {
                    setDialogOpen(false);
                    await loadCustomers();
                    showNotice(message);
                }}
                open={dialogOpen}
                options={options}
            />
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function CustomerDialog({
    canCredit,
    canEdit,
    customer,
    onClose,
    onSaved,
    open,
    options,
}: {
    canCredit: boolean;
    canEdit: boolean;
    customer: Customer | null;
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    options: CustomerOptions;
}) {
    const { t } = useLocale();
    const [form, setForm] = useState<CustomerInput>({
        address: '',
        code: '',
        credit_allowed: false,
        credit_limit: 0,
        customer_type: 'Shop',
        is_active: true,
        name: '',
        notes: '',
        phone: '',
        region_id: 0,
        township: '',
        warehouse_id: 0,
    });
    const [regionId, setRegionId] = useState(0);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const profileDisabled = Boolean(customer && !canEdit);

    useEffect(() => {
        setErrors({});
        const warehouseId = customer?.warehouse_id ?? options.warehouses[0]?.id ?? 0;
        const selectedRegionId =
            customer?.region_id ??
            (options.regions ?? []).find((region) => region.warehouse_id === warehouseId)?.id ??
            0;
        setRegionId(selectedRegionId);
        setForm({
            address: customer?.address ?? '',
            code: customer?.code ?? '',
            credit_allowed: customer?.credit_allowed ?? false,
            credit_limit: customer?.credit_limit ?? 0,
            customer_type: customer?.customer_type ?? 'Shop',
            is_active: customer?.is_active ?? true,
            name: customer?.name ?? '',
            notes: customer?.notes ?? '',
            phone: customer?.phone ?? '',
            region_id: selectedRegionId,
            township: customer?.township ?? '',
            warehouse_id: warehouseId,
        });
    }, [customer, open, options.warehouses, options.regions]);

    const change = (field: keyof CustomerInput, value: boolean | number | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            customer?.is_active &&
            !form.is_active &&
            !window.confirm(
                t('Deactivate {name}? It will remain in history but cannot be selected for new sales.', {
                    name: customer.name,
                }),
            )
        )
            return;
        if (
            customer &&
            canCredit &&
            (customer.credit_allowed !== form.credit_allowed || customer.credit_limit !== form.credit_limit) &&
            !window.confirm(t('Apply the new credit settings for {name}?', { name: customer.name }))
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            if (!customer) await customerApi.create(form);
            else if (canEdit) await customerApi.update(customer.id, form);
            else
                await customerApi.updateCredit(customer.id, {
                    credit_allowed: form.credit_allowed,
                    credit_limit: form.credit_limit,
                });
            await onSaved(t(customer ? 'Customer updated.' : 'Customer created.'));
        } catch (requestError) {
            if (requestError instanceof CustomerApiError) setErrors(requestError.fields);
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
                'Customer profiles belong to one operating warehouse. Credit settings require explicit office authorization.',
            )}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        disabled={saving}
                        form="customer-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? t('Saving…') : t('Save customer')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={
                customer
                    ? t('{action} · {code}', {
                          action: t(profileDisabled ? 'Manage credit' : 'Edit customer'),
                          code: customer.code,
                      })
                    : t('Create customer')
            }
        >
            <form className="management-form" id="customer-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    {customer ? (
                        <label className="ui-field">
                            <span>{t('Customer code')}</span>
                            <input disabled value={form.code} />
                        </label>
                    ) : null}
                    <label className="ui-field">
                        <span>{t('Customer name')}</span>
                        <input
                            autoFocus
                            disabled={profileDisabled}
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Customer type')}</span>
                        <input
                            disabled={profileDisabled}
                            list="customer-type-options"
                            maxLength={100}
                            onChange={(event) => change('customer_type', event.target.value)}
                            value={form.customer_type}
                        />
                        <datalist id="customer-type-options">
                            {options.types.map((type) => (
                                <option key={type} value={type} />
                            ))}
                        </datalist>
                        <FieldError errors={errors} name="customer_type" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Operating warehouse')}</span>
                        <select
                            disabled={profileDisabled}
                            onChange={(event) => {
                                const warehouseId = Number(event.target.value);
                                const nextRegion =
                                    (options.regions ?? []).find((region) => region.warehouse_id === warehouseId)?.id ??
                                    0;
                                setRegionId(nextRegion);
                                setForm((value) => ({
                                    ...value,
                                    warehouse_id: warehouseId,
                                    region_id: nextRegion,
                                }));
                            }}
                            required
                            value={form.warehouse_id}
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
                        <FieldError errors={errors} name="warehouse_id" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Phone')}</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={50}
                            onChange={(event) => change('phone', event.target.value)}
                            type="tel"
                            value={form.phone}
                        />
                        <FieldError errors={errors} name="phone" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Region')}</span>
                        <select
                            disabled={profileDisabled}
                            onChange={(event) => {
                                const id = Number(event.target.value);
                                setRegionId(id);
                                setForm((value) => ({
                                    ...value,
                                    region_id: id,
                                }));
                            }}
                            required
                            value={regionId}
                        >
                            <option value={0}>{t('Select region')}</option>
                            {(options.regions ?? [])
                                .filter((region) => region.warehouse_id === form.warehouse_id)
                                .map((region) => (
                                    <option key={region.id} value={region.id}>
                                        {region.name}
                                    </option>
                                ))}
                        </select>
                        <FieldError errors={errors} name="region_id" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Township')}</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={100}
                            onChange={(event) => change('township', event.target.value)}
                            value={form.township}
                        />
                        <FieldError errors={errors} name="township" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Address')}</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={500}
                            onChange={(event) => change('address', event.target.value)}
                            value={form.address}
                        />
                        <FieldError errors={errors} name="address" />
                    </label>
                    <fieldset className="credit-settings form-grid__wide">
                        <legend>{t('Office credit control')}</legend>
                        <p>
                            {canCredit
                                ? t('Changes are recorded with old and new values.')
                                : t('You can view these settings but need customer.credit_manage to change them.')}
                        </p>
                        <div className="credit-settings__grid">
                            <label className="ui-check">
                                <input
                                    checked={form.credit_allowed}
                                    disabled={!canCredit}
                                    onChange={(event) => change('credit_allowed', event.target.checked)}
                                    type="checkbox"
                                />
                                <span>
                                    <strong>{t('Credit allowed')}</strong>
                                    <small>{t('Required before a credit sale can be posted.')}</small>
                                </span>
                            </label>
                            <label className="ui-field">
                                <span>{t('Credit limit (MMK)')}</span>
                                <input
                                    disabled={!canCredit}
                                    min={0}
                                    onChange={(event) => change('credit_limit', editableNumber(event.target.value))}
                                    required
                                    step={1}
                                    type="number"
                                    value={form.credit_limit}
                                />
                                <FieldError errors={errors} name="credit_limit" />
                            </label>
                        </div>
                    </fieldset>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Notes')}</span>
                        <textarea
                            disabled={profileDisabled}
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
                            disabled={profileDisabled}
                            onChange={(event) => change('is_active', event.target.checked)}
                            type="checkbox"
                        />
                        <span>
                            <strong>{t('Active customer')}</strong>
                            <small>
                                {t('Inactive customers remain in history but cannot be selected for new sales.')}
                            </small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
