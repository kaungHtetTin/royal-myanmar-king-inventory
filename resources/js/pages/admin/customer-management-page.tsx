import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    CustomerApiError,
    customerApi,
    type Customer,
    type CustomerFilters,
    type CustomerInput,
    type CustomerOptions,
} from '../../services/customers';
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
const emptyOptions: CustomerOptions = { types: [], warehouses: [] };

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}
function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
}
function dateTime(value: string | null) {
    if (!value) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

export function CustomerManagementPage() {
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('customer.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('customer.edit'));
    const canCredit = Boolean(isSuperAdmin || user?.permissions.includes('customer.credit_manage'));
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [options, setOptions] = useState<CustomerOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Customer | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        credit: '',
        search: '',
        sort: 'name:asc',
        status: '',
        type: '',
        warehouse_id: '',
    });
    const [filters, setFilters] = useState<CustomerFilters>({
        direction: 'asc',
        page: 1,
        sort: 'name',
    });

    const loadCustomers = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([customerApi.list(filters), customerApi.options()]);
            setCustomers(response.data);
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
        void Promise.all([customerApi.list(filters), customerApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setCustomers(response.data);
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

    const activeCount = customers.filter((customer) => customer.is_active).length;
    const creditCustomers = customers.filter((customer) => customer.credit_allowed);
    const creditLimit = creditCustomers.reduce((total, customer) => total + customer.credit_limit, 0);
    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="admin-page customer-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Master data</p>
                    <h1>Customers</h1>
                    <p>Maintain customer profiles, operating warehouse, and office-controlled credit settings.</p>
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
                        New customer
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Current filtered result"
                    icon="customers"
                    label="Customers"
                    value={String(meta.total)}
                />
                <MetricCard hint="On this page" icon="dashboard" label="Active" value={String(activeCount)} />
                <MetricCard
                    hint="On this page"
                    icon="cash"
                    label="Credit enabled"
                    value={String(creditCustomers.length)}
                />
                <MetricCard
                    hint="Enabled customers on page"
                    icon="reports"
                    label="Credit limits"
                    value={money(creditLimit)}
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
                        Retry
                    </button>
                </div>
            ) : null}

            <Panel eyebrow="Directory" title="Customer accounts">
                <form
                    className="filter-toolbar customer-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const [sort, direction] = draftFilters.sort.split(':') as [string, 'asc' | 'desc'];
                        setLoading(true);
                        setFilters({
                            credit: draftFilters.credit,
                            direction,
                            page: 1,
                            search: draftFilters.search,
                            sort,
                            status: draftFilters.status,
                            type: draftFilters.type,
                            warehouse_id: draftFilters.warehouse_id,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">Search customers</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder="Search code, name, phone, or location"
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
                        <span className="sr-only">Filter by credit</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    credit: event.target.value,
                                }))
                            }
                            value={draftFilters.credit}
                        >
                            <option value="">All credit</option>
                            <option value="allowed">Credit enabled</option>
                            <option value="cash_only">Cash only</option>
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
                        <span className="sr-only">Sort customers</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    sort: event.target.value,
                                }))
                            }
                            value={draftFilters.sort}
                        >
                            <option value="name:asc">Name A-Z</option>
                            <option value="name:desc">Name Z-A</option>
                            <option value="code:asc">Code A-Z</option>
                            <option value="credit_limit:desc">Highest credit</option>
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
                        Loading customers…
                    </div>
                ) : customers.length === 0 ? (
                    <EmptyState
                        description="Change the filters or create the first customer account."
                        title="No customers found"
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table customer-table">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Type / location</th>
                                    <th>Contact</th>
                                    <th>Warehouse</th>
                                    <th className="is-numeric">Credit</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    {canEdit || canCredit ? <th className="ui-table__actions">Actions</th> : null}
                                </tr>
                            </thead>
                            <tbody>
                                {customers.map((customer) => (
                                    <tr key={customer.id}>
                                        <td>
                                            <strong>{customer.name}</strong>
                                            <small>{customer.code}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {customer.customer_type || 'Not specified'}
                                            </span>
                                            <small>
                                                {[customer.township, customer.region].filter(Boolean).join(', ') ||
                                                    'No location'}
                                            </small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{customer.phone || 'Not specified'}</span>
                                            <small>{customer.address || 'No address recorded'}</small>
                                        </td>
                                        <td>
                                            <strong>{customer.warehouse.name}</strong>
                                            <small>{customer.warehouse.code}</small>
                                        </td>
                                        <td className="is-numeric">
                                            {customer.credit_allowed ? (
                                                <>
                                                    <strong>{money(customer.credit_limit)}</strong>
                                                    <small>Credit enabled</small>
                                                </>
                                            ) : (
                                                <span className="table-muted">Cash only</span>
                                            )}
                                        </td>
                                        <td>
                                            <StatusBadge tone={customer.is_active ? 'success' : 'danger'}>
                                                {customer.is_active ? 'Active' : 'Inactive'}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(customer.updated_at)}</span>
                                            <small>Created {dateTime(customer.created_at)}</small>
                                        </td>
                                        {canEdit || canCredit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={`${canEdit ? 'Edit' : 'Manage credit for'} ${customer.name}`}
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
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} customers
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
        region: '',
        township: '',
        warehouse_id: 0,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const profileDisabled = Boolean(customer && !canEdit);

    useEffect(() => {
        setErrors({});
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
            region: customer?.region ?? '',
            township: customer?.township ?? '',
            warehouse_id: customer?.warehouse_id ?? options.warehouses[0]?.id ?? 0,
        });
    }, [customer, open, options.warehouses]);

    const change = (field: keyof CustomerInput, value: boolean | number | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            customer?.is_active &&
            !form.is_active &&
            !window.confirm(
                `Deactivate ${customer.name}? It will remain in history but cannot be selected for new sales.`,
            )
        )
            return;
        if (
            customer &&
            canCredit &&
            (customer.credit_allowed !== form.credit_allowed || customer.credit_limit !== form.credit_limit) &&
            !window.confirm(`Apply the new credit settings for ${customer.name}?`)
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
            await onSaved(customer ? 'Customer updated.' : 'Customer created.');
        } catch (requestError) {
            if (requestError instanceof CustomerApiError) setErrors(requestError.fields);
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
            description="Customer profiles belong to one operating warehouse. Credit settings require explicit office authorization."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={saving}
                        form="customer-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save customer'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={
                customer
                    ? `${profileDisabled ? 'Manage credit' : 'Edit customer'} · ${customer.code}`
                    : 'Create customer'
            }
        >
            <form className="management-form" id="customer-management-form" onSubmit={submit}>
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Customer code</span>
                        <input
                            autoFocus
                            disabled={profileDisabled}
                            maxLength={50}
                            onChange={(event) => change('code', event.target.value.toUpperCase())}
                            placeholder="CUS-ABC"
                            required
                            value={form.code}
                        />
                        <FieldError errors={errors} name="code" />
                    </label>
                    <label className="ui-field">
                        <span>Customer name</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field">
                        <span>Customer type</span>
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
                        <span>Operating warehouse</span>
                        <select
                            disabled={profileDisabled}
                            onChange={(event) => change('warehouse_id', Number(event.target.value))}
                            required
                            value={form.warehouse_id}
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
                        <FieldError errors={errors} name="warehouse_id" />
                    </label>
                    <label className="ui-field">
                        <span>Phone</span>
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
                        <span>Region</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={100}
                            onChange={(event) => change('region', event.target.value)}
                            value={form.region}
                        />
                        <FieldError errors={errors} name="region" />
                    </label>
                    <label className="ui-field">
                        <span>Township</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={100}
                            onChange={(event) => change('township', event.target.value)}
                            value={form.township}
                        />
                        <FieldError errors={errors} name="township" />
                    </label>
                    <label className="ui-field">
                        <span>Address</span>
                        <input
                            disabled={profileDisabled}
                            maxLength={500}
                            onChange={(event) => change('address', event.target.value)}
                            value={form.address}
                        />
                        <FieldError errors={errors} name="address" />
                    </label>
                    <fieldset className="credit-settings form-grid__wide">
                        <legend>Office credit control</legend>
                        <p>
                            {canCredit
                                ? 'Changes are recorded with old and new values.'
                                : 'You can view these settings but need customer.credit_manage to change them.'}
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
                                    <strong>Credit allowed</strong>
                                    <small>Required before a credit sale can be posted.</small>
                                </span>
                            </label>
                            <label className="ui-field">
                                <span>Credit limit (MMK)</span>
                                <input
                                    disabled={!canCredit}
                                    min={0}
                                    onChange={(event) => change('credit_limit', Number(event.target.value))}
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
                        <span>Notes</span>
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
                            <strong>Active customer</strong>
                            <small>Inactive customers remain in history but cannot be selected for new sales.</small>
                        </span>
                    </label>
                </div>
            </form>
        </Dialog>
    );
}
