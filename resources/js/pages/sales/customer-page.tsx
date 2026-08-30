import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import { SaleApiError, saleApi, type PaymentMethod, type SalesCustomer, type SalesCustomerInput } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { editableNumber } from '../../ui/form-values';
import { Button, Dialog, EmptyState, IconButton, Pagination, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

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
    region_id: 0,
    township: '',
};

function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

export function SalesCustomerPage() {
    const { formatNumber, t } = useLocale();
    const [customers, setCustomers] = useState<SalesCustomer[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [collecting, setCollecting] = useState(false);
    const [selected, setSelected] = useState<SalesCustomer | null>(null);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [collection, setCollection] = useState({ amount: 0, notes: '', payment_method: 'cash' });
    const [collectionErrors, setCollectionErrors] = useState<Record<string, string[]>>({});
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await saleApi.customers({ page, search: search || undefined });
            setCustomers(response.data);
            setMeta(response.meta);
            setError('');
        } catch (requestError) {
            setError(message(requestError, t('Unable to complete the request.')));
        } finally {
            setLoading(false);
        }
    }, [page, search, t]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    useEffect(() => {
        void saleApi.customerOptions().then((response) => {
            const methods = response.payment_methods ?? [
                { key: 'cash', name: 'Cash', adds_to_cash_hold: true, is_active: true },
                { key: 'banking', name: 'Banking', adds_to_cash_hold: false, is_active: true },
            ];
            setPaymentMethods(methods);
            setCollection((current) => ({ ...current, payment_method: methods[0]?.key ?? current.payment_method }));
        }).catch(() => undefined);
    }, []);
    const selectedMethod = paymentMethods.find((method) => method.key === collection.payment_method);
    const openCollection = (customer: SalesCustomer) => {
        setSelected(customer);
        setCollection({ amount: customer.outstanding_amount, notes: '', payment_method: paymentMethods[0]?.key ?? 'cash' });
        setCollectionErrors({});
    };
    const collect = async (event: FormEvent) => {
        event.preventDefault();
        if (!selected) return;
        setCollecting(true);
        setCollectionErrors({});
        try {
            const result = await saleApi.collectCredit({ customer_id: selected.id, ...collection });
            setSelected(null);
            await load();
            setNotice(
                t('{amount} MMK collected. Remaining customer credit: {remaining} MMK.', {
                    amount: formatNumber(collection.amount),
                    remaining: formatNumber(result.outstanding_amount),
                }),
            );
            window.setTimeout(() => setNotice(''), 5000);
        } catch (requestError) {
            if (requestError instanceof SaleApiError) setCollectionErrors(requestError.fields);
            setCollectionErrors((current) => ({
                ...current,
                form: [message(requestError, t('Unable to collect customer credit.'))],
            }));
        } finally {
            setCollecting(false);
        }
    };

    return (
        <div className="sales-stock-page">
            <header className="sales-page-heading">
                <div>
                    <p>{t('Route customers')}</p>
                    <h1>{t('Customers')}</h1>
                </div>
                <Link className="ui-button ui-button--primary" to="/sales/customers/new">
                    <Icon name="plus" size={16} /> {t('New customer')}
                </Link>
            </header>
            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="check" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">{t('Assigned warehouse')}</p>
                        <h2>{t('Customer list')}</h2>
                    </div>
                    <StatusBadge tone="neutral">
                        {t('{count} customers', { count: formatNumber(meta.total) })}
                    </StatusBadge>
                </header>
                <label className="ui-field sales-customer-list-search">
                    <span>{t('Search customers')}</span>
                    <input
                        onChange={(event) => {
                            setPage(1);
                            setSearch(event.target.value);
                        }}
                        placeholder={t('Search code, name, phone, or township')}
                        type="search"
                        value={search}
                    />
                </label>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        {t('Loading customers…')}
                    </div>
                ) : customers.length === 0 ? (
                    <EmptyState
                        description={t('Create a customer to make them available for new sales.')}
                        title={t('No customers found')}
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
                                        {customer.code} · {customer.customer_type || t('Customer')}
                                    </small>
                                    <small className="sales-customer-list__coverage">
                                        {customer.region?.warehouse?.name ?? t('Warehouse unavailable')} ·{' '}
                                        {customer.region?.name ?? t('Region unavailable')}
                                    </small>
                                </div>
                                <div className="sales-stock-list__quantity sales-customer-list__meta">
                                    <strong>{customer.phone || t('No phone')}</strong>
                                    <small>{customer.township || customer.region?.name || t('No location')}</small>
                                    {customer.outstanding_amount > 0 ? (
                                        <div className="sales-customer-credit-action">
                                            <StatusBadge tone="warning">
                                                {moneyLabel(formatNumber(customer.outstanding_amount))}
                                            </StatusBadge>
                                            <IconButton
                                                icon="cash"
                                                label={t('Collect credit from {customer}', { customer: customer.name })}
                                                onClick={() => openCollection(customer)}
                                                tone="primary"
                                            />
                                        </div>
                                    ) : (
                                        <StatusBadge tone={customer.is_active ? 'success' : 'neutral'}>
                                            {t(customer.is_active ? 'No credit due' : 'Inactive')}
                                        </StatusBadge>
                                    )}
                                </div>
                            </article>
                        ))}
                    </div>
                )}
                <Pagination label={t('Customer list')} loading={loading} meta={meta} onPageChange={setPage} />
            </section>
            <Dialog
                description={selected ? t('Record the customer payment and update the trip balance.') : ''}
                footer={
                    <>
                        <Button disabled={collecting} onClick={() => setSelected(null)}>
                            {t('Cancel')}
                        </Button>
                        <Button
                            disabled={
                                collecting ||
                                collection.amount <= 0 ||
                                collection.amount > (selected?.outstanding_amount ?? 0)
                            }
                            form="credit-collection-form"
                            requiresOnline
                            tone="primary"
                            type="submit"
                        >
                            {t(collecting ? 'Collecting…' : 'Confirm collection')}
                        </Button>
                    </>
                }
                onClose={() => setSelected(null)}
                open={Boolean(selected)}
                title={t('Collect customer credit')}
                width="compact"
            >
                {selected ? (
                    <form className="credit-collection-form" id="credit-collection-form" onSubmit={collect}>
                        <div className="credit-collection-customer">
                            <span>
                                <Icon name="customers" size={18} />
                            </span>
                            <div>
                                <small>{selected.code}</small>
                                <strong>{selected.name}</strong>
                            </div>
                            <div>
                                <small>{t('Credit remaining')}</small>
                                <strong>{formatNumber(selected.outstanding_amount)} MMK</strong>
                            </div>
                        </div>
                        <div className="credit-collection-context">
                            <Icon name="truck" size={15} />
                            <span>{t(selectedMethod?.adds_to_cash_hold ? 'Added to your current trip cash hold automatically.' : 'Recorded in this trip without increasing your cash hold.')}</span>
                        </div>
                        {collectionErrors.form?.[0] ? (
                            <div className="ui-form-error" role="alert">
                                {collectionErrors.form[0]}
                            </div>
                        ) : null}
                        <fieldset className="credit-collection-methods">
                            <legend>{t('Payment method')}</legend>
                            <div>
                                {paymentMethods.map((method) => (
                                    <label className={collection.payment_method === method.key ? 'is-selected' : ''} key={method.key}>
                                        <input
                                            checked={collection.payment_method === method.key}
                                            name="collection_payment_method"
                                            onChange={() => setCollection((current) => ({ ...current, payment_method: method.key }))}
                                            type="radio"
                                        />
                                        <Icon name={method.adds_to_cash_hold ? 'cash' : 'building'} size={16} />
                                        <span><strong>{method.name}</strong><small>{t(method.adds_to_cash_hold ? 'Cash in your custody' : 'Direct / banking')}</small></span>
                                    </label>
                                ))}
                            </div>
                            {collectionErrors.payment_method?.[0] ? <small className="ui-field__error">{collectionErrors.payment_method[0]}</small> : null}
                        </fieldset>
                        <section className="credit-collection-amount">
                            <div className="credit-collection-amount__heading">
                                <label htmlFor="credit-collection-amount">{t('Amount received')}</label>
                                <small>MMK</small>
                            </div>
                            <div className="credit-collection-amount__input">
                                <Icon name="cash" size={16} />
                                <input
                                    autoFocus
                                    id="credit-collection-amount"
                                    inputMode="numeric"
                                    max={selected.outstanding_amount}
                                    min={1}
                                    onChange={(event) =>
                                        setCollection((current) => ({
                                            ...current,
                                            amount: editableNumber(event.target.value),
                                        }))
                                    }
                                    required
                                    type="number"
                                    value={collection.amount}
                                />
                            </div>
                            <div className="credit-collection-presets" aria-label={t('Quick amount choices')}>
                                <button
                                    onClick={() =>
                                        setCollection((current) => ({
                                            ...current,
                                            amount: Math.max(1, Math.round(selected.outstanding_amount * 0.25)),
                                        }))
                                    }
                                    type="button"
                                >
                                    25%
                                </button>
                                <button
                                    onClick={() =>
                                        setCollection((current) => ({
                                            ...current,
                                            amount: Math.max(1, Math.round(selected.outstanding_amount * 0.5)),
                                        }))
                                    }
                                    type="button"
                                >
                                    50%
                                </button>
                                <button
                                    className="is-full"
                                    onClick={() =>
                                        setCollection((current) => ({
                                            ...current,
                                            amount: selected.outstanding_amount,
                                        }))
                                    }
                                    type="button"
                                >
                                    {t('Full amount')}
                                </button>
                            </div>
                            {collectionErrors.amount?.[0] ? (
                                <small className="ui-field__error">{collectionErrors.amount[0]}</small>
                            ) : null}
                        </section>
                        <div className="credit-collection-preview" aria-live="polite">
                            <div>
                                <small>{t('Customer credit after')}</small>
                                <strong>
                                    {formatNumber(Math.max(0, selected.outstanding_amount - collection.amount))} MMK
                                </strong>
                            </div>
                            <div>
                                <small>{t(selectedMethod?.adds_to_cash_hold ? 'Added to cash hold' : 'Recorded as banking')}</small>
                                <strong>+{formatNumber(Math.max(0, collection.amount))} MMK</strong>
                            </div>
                        </div>
                        <label className="ui-field credit-collection-note">
                            <span>
                                {t('Note')} <small>{t('(optional)')}</small>
                            </span>
                            <textarea
                                onChange={(event) =>
                                    setCollection((current) => ({ ...current, notes: event.target.value }))
                                }
                                placeholder={t('Receipt number or collection detail')}
                                rows={2}
                                value={collection.notes}
                            />
                        </label>
                    </form>
                ) : null}
            </Dialog>
        </div>
    );
}

function moneyLabel(amount: string) {
    return `${amount} MMK due`;
}

export function NewSalesCustomerPage() {
    const { t } = useLocale();
    const navigate = useNavigate();
    const [form, setForm] = useState(emptyForm);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const [regions, setRegions] = useState<Array<{ id: number; name: string }>>([]);
    useEffect(() => {
        void saleApi
            .customerOptions()
            .then((response) => setRegions(response.regions ?? []))
            .catch((requestError) =>
                setErrors({ form: [message(requestError, t('Unable to complete the request.'))] }),
            );
    }, [t]);
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
            setErrors((current) => ({
                ...current,
                form: [message(requestError, t('Unable to complete the request.'))],
            }));
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
                        {t('Customers')}
                    </Link>
                    <p className="ui-eyebrow">{t('Route customers')}</p>
                    <h1>{t('New customer')}</h1>
                </div>
            </header>
            <form className="sales-section sales-profile-settings-form" onSubmit={submit}>
                <header>
                    <div>
                        <p className="ui-eyebrow">{t('Cash-only profile')}</p>
                        <h2>{t('Customer information')}</h2>
                    </div>
                </header>
                <div className="sales-profile-settings-form__body">
                    <div className="sales-profile-security-note" role="note">
                        <Icon name="cash" size={16} />
                        <span>
                            {t(
                                'Credit is disabled and the credit limit starts at 0. Office staff can manage credit later.',
                            )}
                        </span>
                    </div>
                    {errors.form?.[0] ? (
                        <div className="ui-form-error" role="alert">
                            {errors.form[0]}
                        </div>
                    ) : null}
                    <div className="sales-profile-form-grid">
                        <CustomerField error={fieldError('name')} label={t('Customer name')}>
                            <input
                                autoFocus
                                maxLength={255}
                                onChange={(event) => change('name', event.target.value)}
                                placeholder={t('Enter customer name')}
                                required
                                value={form.name}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('customer_type')} label={t('Customer type')}>
                            <input
                                maxLength={100}
                                onChange={(event) => change('customer_type', event.target.value)}
                                value={form.customer_type}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('phone')} label={t('Phone')}>
                            <input
                                maxLength={50}
                                onChange={(event) => change('phone', event.target.value)}
                                placeholder={t('Enter phone number')}
                                value={form.phone}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('region_id')} label={t('Region')}>
                            <select
                                onChange={(event) => change('region_id', Number(event.target.value))}
                                required
                                value={form.region_id}
                            >
                                <option value={0}>{t('Select region')}</option>
                                {regions.map((region) => (
                                    <option key={region.id} value={region.id}>
                                        {region.name}
                                    </option>
                                ))}
                            </select>
                        </CustomerField>
                        <CustomerField error={fieldError('township')} label={t('Township')}>
                            <input
                                maxLength={100}
                                onChange={(event) => change('township', event.target.value)}
                                placeholder={t('Enter township')}
                                value={form.township}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('address')} label={t('Address')}>
                            <input
                                maxLength={500}
                                onChange={(event) => change('address', event.target.value)}
                                placeholder={t('Enter customer address')}
                                value={form.address}
                            />
                        </CustomerField>
                        <CustomerField error={fieldError('notes')} label={t('Notes')}>
                            <textarea
                                maxLength={1000}
                                onChange={(event) => change('notes', event.target.value)}
                                placeholder={t('Optional notes')}
                                rows={3}
                                value={form.notes}
                            />
                        </CustomerField>
                    </div>
                </div>
                <footer>
                    <Button disabled={saving} onClick={() => navigate('/sales/customers')} type="button">
                        {t('Cancel')}
                    </Button>
                    <Button disabled={saving} requiresOnline tone="primary" type="submit">
                        {t(saving ? 'Creating…' : 'Create customer')}
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
