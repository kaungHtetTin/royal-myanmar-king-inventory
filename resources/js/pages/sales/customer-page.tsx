import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { SaleApiError, saleApi, type SalesCustomer, type SalesCustomerInput } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, Pagination, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptyForm: SalesCustomerInput = {
    address: '',
    customer_type: 'Shop',
    name: '',
    notes: '',
    phone: '',
    region: '',
    township: '',
    way_id: 0,
};

function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}

export function SalesCustomerPage() {
    const [customers, setCustomers] = useState<SalesCustomer[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await saleApi.customers({ page, search: search || undefined });
            setCustomers(response.data);
            setMeta(response.meta);
            setError('');
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [page, search]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    return (
        <div className="sales-stock-page">
            <header className="sales-page-heading">
                <div>
                    <p>Route customers</p>
                    <h1>Customers</h1>
                </div>
                <Link className="ui-button ui-button--primary" to="/sales/customers/new">
                    <Icon name="plus" size={16} /> New customer
                </Link>
            </header>
            {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">Assigned warehouse</p>
                        <h2>Customer list</h2>
                    </div>
                    <StatusBadge tone="neutral">{meta.total} customers</StatusBadge>
                </header>
                <label className="ui-field sales-customer-list-search">
                    <span>Search customers</span>
                    <input
                        onChange={(event) => {
                            setPage(1);
                            setSearch(event.target.value);
                        }}
                        placeholder="Search code, name, phone, or township"
                        type="search"
                        value={search}
                    />
                </label>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading customers…
                    </div>
                ) : customers.length === 0 ? (
                    <EmptyState
                        description="Create a customer to make them available for new sales."
                        title="No customers found"
                    />
                ) : (
                    <div className="sales-stock-list sales-customer-list">
                        {customers.map((customer) => (
                            <article key={customer.id}>
                                <span className="sales-stock-list__icon">
                                    <Icon name="customers" size={17} />
                                </span>
                                <div>
                                    <strong>{customer.name}</strong>
                                    <small>
                                        {customer.code} · {customer.customer_type || 'Customer'}
                                    </small>
                                </div>
                                <div className="sales-stock-list__quantity sales-customer-list__meta">
                                    <strong>{customer.phone || 'No phone'}</strong>
                                    <small>{customer.township || customer.region || 'No location'}</small>
                                    <StatusBadge tone={customer.is_active ? 'success' : 'neutral'}>
                                        {customer.is_active ? 'Cash only' : 'Inactive'}
                                    </StatusBadge>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <Pagination label="Customer list" loading={loading} meta={meta} onPageChange={setPage} />
            </section>
        </div>
    );
}

export function NewSalesCustomerPage() {
    const navigate = useNavigate();
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [regions, setRegions] = useState<
        Array<{ id: number; name: string; ways: Array<{ id: number; code: string; name: string }> }>
    >([]);
    useEffect(() => {
        void saleApi
            .options()
            .then((response) => setRegions(response.representative.regions ?? []))
            .catch((requestError) => setErrors({ form: [message(requestError)] }));
    }, []);
    const change = (field: keyof SalesCustomerInput, value: string | number) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            await saleApi.createCustomer(form);
            navigate('/sales/customers', { replace: true });
        } catch (requestError) {
            if (requestError instanceof SaleApiError) setErrors(requestError.fields);
            setErrors((current) => ({ ...current, form: [message(requestError)] }));
        } finally {
            setSaving(false);
        }
    };
    const fieldError = (name: keyof SalesCustomerInput) =>
        errors[name]?.[0] ? <small className="ui-field__error">{errors[name][0]}</small> : null;

    return (
        <div className="sales-stock-page">
            <header className="sales-page-heading sale-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/sales/customers">
                        <Icon name="chevronLeft" size={13} />
                        Customers
                    </Link>
                    <p className="ui-eyebrow">Route customers</p>
                    <h1>New customer</h1>
                </div>
            </header>
            <form className="sales-section sales-profile-settings-form" onSubmit={submit}>
                <header>
                    <div>
                        <p className="ui-eyebrow">Cash-only profile</p>
                        <h2>Customer information</h2>
                    </div>
                </header>
                <div className="sales-profile-settings-form__body">
                    <div className="sales-profile-security-note" role="note">
                        <Icon name="cash" size={16} />
                        <span>
                            Credit is disabled and the credit limit starts at 0. Office staff can manage credit later.
                        </span>
                    </div>
                    {errors.form?.[0] ? (
                        <div className="ui-form-error" role="alert">
                            {errors.form[0]}
                        </div>
                    ) : null}
                    <div className="sales-profile-form-grid">
                        <CustomerField error={fieldError('name')} label="Customer name">
                            <input
                                autoFocus
                                maxLength={255}
                                onChange={(event) => change('name', event.target.value)}
                                placeholder="Enter customer name"
                                required
                                value={form.name}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('customer_type')} label="Customer type">
                            <input
                                maxLength={100}
                                onChange={(event) => change('customer_type', event.target.value)}
                                value={form.customer_type}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('phone')} label="Phone">
                            <input
                                maxLength={50}
                                onChange={(event) => change('phone', event.target.value)}
                                placeholder="Enter phone number"
                                value={form.phone}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('region')} label="Region">
                            <select
                                onChange={(event) => {
                                    const region = regions.find((item) => item.id === Number(event.target.value));
                                    setForm((value) => ({
                                        ...value,
                                        region: region?.name ?? '',
                                        way_id: region?.ways[0]?.id ?? 0,
                                        township: region?.ways[0]?.name ?? '',
                                    }));
                                }}
                                required
                                value={regions.find((region) => region.name === form.region)?.id ?? 0}
                            >
                                <option value={0}>Select region</option>
                                {regions.map((region) => (
                                    <option key={region.id} value={region.id}>
                                        {region.name}
                                    </option>
                                ))}
                            </select>
                        </CustomerField>
                        <CustomerField error={fieldError('way_id')} label="Way">
                            <select
                                onChange={(event) => {
                                    const way = regions
                                        .flatMap((region) => region.ways)
                                        .find((item) => item.id === Number(event.target.value));
                                    setForm((value) => ({ ...value, way_id: way?.id ?? 0, township: way?.name ?? '' }));
                                }}
                                required
                                value={form.way_id}
                            >
                                <option value={0}>Select Way</option>
                                {(regions.find((region) => region.name === form.region)?.ways ?? []).map((way) => (
                                    <option key={way.id} value={way.id}>
                                        {way.name} · {way.code}
                                    </option>
                                ))}
                            </select>
                        </CustomerField>
                        <CustomerField error={fieldError('address')} label="Address">
                            <input
                                maxLength={500}
                                onChange={(event) => change('address', event.target.value)}
                                placeholder="Enter customer address"
                                value={form.address}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('notes')} label="Notes">
                            <textarea
                                maxLength={1000}
                                onChange={(event) => change('notes', event.target.value)}
                                placeholder="Optional notes"
                                rows={3}
                                value={form.notes}
                            />
                        </CustomerField>
                    </div>
                </div>
                <footer>
                    <Button disabled={saving} onClick={() => navigate('/sales/customers')} type="button">
                        Cancel
                    </Button>
                    <Button disabled={saving} requiresOnline tone="primary" type="submit">
                        {saving ? 'Creating…' : 'Create customer'}
                    </Button>
                </footer>
            </form>
        </div>
    );
}

function CustomerField({
    children,
    error,
    label,
}: {
    children: React.ReactNode;
    error?: React.ReactNode;
    label: string;
}) {
    return (
        <label className="ui-field">
            <span>{label}</span>
            {children}
            {error}
        </label>
    );
}
