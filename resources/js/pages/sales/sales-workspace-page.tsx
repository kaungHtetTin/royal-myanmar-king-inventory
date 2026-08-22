import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useBranding } from '../../branding/branding-context';
import type { PaginationMeta } from '../../services/administration';
import { printInvoice } from '../../services/invoice-print';
import { SaleApiError, saleApi, type Sale, type SaleInput, type SaleOptions } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, IconButton, Pagination, StatusBadge } from '../../ui/primitives';

const emptyOptions: SaleOptions = {
    cash_hold: 0,
    customers: [],
    products: [],
    representative: { code: '', id: 0, name: '' },
};
const emptyForm: SaleInput = {
    customer_id: 0,
    items: [],
    notes: '',
    payment_type: 'cash',
};
const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 10,
    to: null,
    total: 0,
};
const wizardSteps = [
    { label: 'Information', number: 1 },
    { label: 'Products', number: 2 },
    { label: 'Quantity', number: 3 },
    { label: 'Review & submit', number: 4 },
] as const;
type SaleWizardStep = (typeof wizardSteps)[number]['number'];
function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
}
function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the sale.';
}
function tone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

function formFromSale(sale: Sale): SaleInput {
    return {
        customer_id: sale.customer.id,
        payment_type: sale.payment_type,
        notes: sale.notes ?? '',
        items: sale.items.map((item) => ({
            product_id: item.product.id,
            quantity: item.quantity,
        })),
    };
}

type SalesWorkspaceView = 'entry' | 'history';

function SalesWorkspacePage({ editId = 0, view }: { editId?: number; view: SalesWorkspaceView }) {
    const { branding } = useBranding();
    const navigate = useNavigate();
    const [options, setOptions] = useState(emptyOptions);
    const [sales, setSales] = useState<Sale[]>([]);
    const [salesMeta, setSalesMeta] = useState(emptyMeta);
    const [historyPage, setHistoryPage] = useState(1);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState<Sale | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const [actionMenuSaleId, setActionMenuSaleId] = useState<number | null>(null);
    const [wizardStep, setWizardStep] = useState<SaleWizardStep>(1);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
    const customerPickerRef = useRef<HTMLDivElement>(null);
    const load = useCallback(async () => {
        try {
            const [nextOptions, history, editResponse] = await Promise.all([
                saleApi.options(),
                view === 'history' ? saleApi.ownSales({ page: historyPage }) : Promise.resolve(null),
                view === 'entry' && editId ? saleApi.ownSale(editId) : Promise.resolve(null),
            ]);
            const editSale = editResponse?.data.status === 'draft' ? editResponse.data : undefined;
            setOptions(nextOptions);
            if (history) {
                setSales(history.data);
                setSalesMeta(history.meta);
            }
            if (editSale) setEditing(editSale);
            setForm((value) => ({
                ...(editSale
                    ? formFromSale(editSale)
                    : {
                          ...value,
                          customer_id: value.customer_id,
                          items: value.items.map((item) => ({
                              ...item,
                              product_id: item.product_id || nextOptions.products[0]?.id || 0,
                          })),
                      }),
            }));
            setError('');
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [editId, historyPage, view]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    useEffect(() => {
        const closeActionMenu = (event: KeyboardEvent | PointerEvent) => {
            if (event instanceof KeyboardEvent) {
                if (event.key !== 'Escape') return;
                const trigger = document.querySelector<HTMLButtonElement>(
                    '.sales-history__menu-trigger[aria-expanded="true"]',
                );
                setActionMenuSaleId(null);
                trigger?.focus();
                return;
            }
            if (
                event instanceof PointerEvent &&
                event.target instanceof Element &&
                event.target.closest('.sales-history__menu')
            )
                return;
            setActionMenuSaleId(null);
        };
        document.addEventListener('keydown', closeActionMenu);
        document.addEventListener('pointerdown', closeActionMenu);
        return () => {
            document.removeEventListener('keydown', closeActionMenu);
            document.removeEventListener('pointerdown', closeActionMenu);
        };
    }, []);
    const selectedCustomer = options.customers.find((customer) => customer.id === form.customer_id);
    const filteredCustomers = useMemo(() => {
        const query = customerQuery.trim().toLowerCase();
        if (!query) return options.customers;
        return options.customers.filter((customer) =>
            `${customer.code} ${customer.name}`.toLowerCase().includes(query),
        );
    }, [customerQuery, options.customers]);
    useEffect(() => {
        const closeCustomerPicker = (event: KeyboardEvent | PointerEvent) => {
            if (event instanceof KeyboardEvent) {
                if (event.key !== 'Escape') return;
                setCustomerPickerOpen(false);
                document.getElementById('sale-customer-search')?.focus();
                return;
            }
            if (event.target instanceof Node && customerPickerRef.current?.contains(event.target)) return;
            setCustomerPickerOpen(false);
        };
        document.addEventListener('keydown', closeCustomerPicker);
        document.addEventListener('pointerdown', closeCustomerPicker);
        return () => {
            document.removeEventListener('keydown', closeCustomerPicker);
            document.removeEventListener('pointerdown', closeCustomerPicker);
        };
    }, []);
    const preview = useMemo(
        () =>
            form.items.reduce(
                (total, line) =>
                    total +
                    line.quantity *
                        (options.products.find((product) => product.id === line.product_id)?.selling_price ?? 0),
                0,
            ),
        [form.items, options.products],
    );
    const chooseCustomer = (customerId: number) => {
        const customer = options.customers.find((option) => option.id === customerId);
        if (!customer) return;
        setForm((value) => ({
            ...value,
            customer_id: customer.id,
            payment_type: !customer.credit_allowed && value.payment_type === 'credit' ? 'cash' : value.payment_type,
        }));
        setFields((value) => ({ ...value, customer_id: [] }));
        setCustomerQuery(`${customer.code} · ${customer.name}`);
        setCustomerPickerOpen(false);
    };
    const showNotice = (value: string) => {
        setNotice(value);
        window.setTimeout(() => setNotice(''), 4500);
    };
    const reset = () => {
        setEditing(null);
        setFields({});
        setForm({
            ...emptyForm,
            customer_id: 0,
            items: [],
        });
        setCustomerQuery('');
        setCustomerPickerOpen(false);
        setWizardStep(1);
        navigate('/sales/new-sale', { replace: true });
    };
    const validate = (forPosting: boolean) => {
        const next: Record<string, string[]> = {};
        if (!form.customer_id) next.customer_id = ['Select a customer.'];
        const seen = new Set<number>();
        form.items.forEach((line, index) => {
            const product = options.products.find((item) => item.id === line.product_id);
            if (!product) next[`items.${index}.product_id`] = ['Select an available product.'];
            else if (seen.has(line.product_id))
                next[`items.${index}.product_id`] = ['Each product can appear only once.'];
            else seen.add(line.product_id);
            if (!Number.isInteger(line.quantity) || line.quantity < 1)
                next[`items.${index}.quantity`] = ['Enter a whole quantity of at least 1.'];
            else if (forPosting && product && line.quantity > product.quantity)
                next[`items.${index}.quantity`] = [`Only ${product.quantity} units are currently available.`];
        });
        if (
            forPosting &&
            form.payment_type === 'credit' &&
            (!selectedCustomer?.credit_allowed || preview > selectedCustomer.available_credit)
        )
            next.payment_type = [
                selectedCustomer?.credit_allowed
                    ? `Only ${money(selectedCustomer.available_credit)} credit is currently available.`
                    : 'Credit sales are disabled for this customer.',
            ];
        setFields(next);
        if (Object.keys(next).length) {
            setError('Review the highlighted sale details before continuing.');
            return false;
        }
        return true;
    };
    const validateWizardStep = (step: SaleWizardStep) => {
        const next: Record<string, string[]> = {};
        if (step === 1 && !form.customer_id) next.customer_id = ['Select a customer.'];
        if (step === 2) {
            if (form.items.length === 0) next.items = ['Select at least one product.'];
            const selected = new Set<number>();
            form.items.forEach((line, index) => {
                if (!options.products.some((product) => product.id === line.product_id))
                    next[`items.${index}.product_id`] = ['Select an available product.'];
                else if (selected.has(line.product_id))
                    next[`items.${index}.product_id`] = ['Each product can appear only once.'];
                else selected.add(line.product_id);
            });
        }
        if (step === 3) {
            form.items.forEach((line, index) => {
                const product = options.products.find((item) => item.id === line.product_id);
                if (!Number.isInteger(line.quantity) || line.quantity < 1)
                    next[`items.${index}.quantity`] = ['Enter a whole quantity of at least 1.'];
                else if (product && line.quantity > product.quantity)
                    next[`items.${index}.quantity`] = [`Only ${product.quantity} units are currently available.`];
            });
        }
        setFields(next);
        if (Object.keys(next).length > 0) {
            setError(`Complete the ${wizardSteps[step - 1].label.toLowerCase()} step before continuing.`);
            return false;
        }
        setError('');
        return true;
    };
    const continueWizard = () => {
        if (wizardStep === 4 || !validateWizardStep(wizardStep)) return;
        setWizardStep((wizardStep + 1) as SaleWizardStep);
    };
    const goBack = () => {
        setError('');
        setFields({});
        setWizardStep((wizardStep - 1) as SaleWizardStep);
    };
    const toggleProduct = (productId: number) => {
        setFields({});
        setForm((value) => ({
            ...value,
            items: value.items.some((item) => item.product_id === productId)
                ? value.items.filter((item) => item.product_id !== productId)
                : [...value.items, { product_id: productId, quantity: 1 }],
        }));
    };
    const save = async (postAfter: boolean) => {
        if (!validate(postAfter)) return;
        setSaving(true);
        setError('');
        try {
            const response = editing ? await saleApi.update(editing.id, form) : await saleApi.create(form);
            const sale = response.data;
            if (postAfter) {
                if (
                    !window.confirm(
                        `Post ${sale.reference} for ${money(sale.total_amount)}? Stock and ${sale.payment_type === 'cash' ? 'cash hold' : 'customer credit'} will update immediately.`,
                    )
                ) {
                    await load();
                    setEditing(sale);
                    return;
                }
                await saleApi.post(sale.id);
                showNotice(`${sale.reference} posted successfully.`);
                reset();
            } else {
                showNotice(`${sale.reference} saved as draft.`);
                setEditing(sale);
            }
            await load();
        } catch (requestError) {
            if (requestError instanceof SaleApiError) setFields(requestError.fields);
            setError(message(requestError));
        } finally {
            setSaving(false);
        }
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (wizardStep < 4) continueWizard();
        else void save(false);
    };
    const edit = (sale: Sale) => {
        setActionMenuSaleId(null);
        navigate(`/sales/new-sale?edit=${sale.id}`);
    };
    const postDraft = async (sale: Sale) => {
        setActionMenuSaleId(null);
        if (!window.confirm(`Post ${sale.reference} for ${money(sale.total_amount)}?`)) return;
        setSaving(true);
        try {
            await saleApi.post(sale.id);
            await load();
            showNotice(`${sale.reference} posted successfully.`);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="sales-stock-page sales-workspace">
            <header className="sales-page-heading">
                <div>
                    <p>Customer sales</p>
                    <h1>{view === 'entry' ? (editing ? `Edit ${editing.reference}` : 'New sale') : 'Sales history'}</h1>
                </div>
                <StatusBadge tone={view === 'entry' ? 'info' : 'neutral'}>
                    {view === 'entry' ? 'Server priced' : `${salesMeta.total} records`}
                </StatusBadge>
            </header>
            {view === 'history' ? (
                <section className="sales-summary-grid" aria-label="Sales summary">
                    <article className="sales-summary-card is-primary">
                        <span>
                            <Icon name="cash" size={18} />
                        </span>
                        <small>Cash hold</small>
                        <strong>{money(options.cash_hold)}</strong>
                        <p>From posted cash sales</p>
                    </article>
                    <article className="sales-summary-card">
                        <span>
                            <Icon name="box" size={18} />
                        </span>
                        <small>Sale-ready stock</small>
                        <strong>{options.products.reduce((sum, product) => sum + product.quantity, 0)}</strong>
                        <p>{options.products.length} active products</p>
                    </article>
                </section>
            ) : null}
            {notice ? (
                <div className="ui-flash ui-flash--success">
                    <Icon name="sales" size={15} />
                    {notice}
                </div>
            ) : null}
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            {view === 'entry' ? (
                <div className="sale-entry-grid">
                    <form className="sales-section sale-entry-form" onSubmit={submit}>
                        <header>
                            <div>
                                <p className="ui-eyebrow">Sale details</p>
                                <h2>{editing ? 'Update draft' : 'Create customer sale'}</h2>
                            </div>
                            {editing ? <Button onClick={reset}>New</Button> : null}
                        </header>
                        {loading ? (
                            <div className="ui-loading">
                                <span />
                                Loading sale options…
                            </div>
                        ) : options.customers.length === 0 || options.products.length === 0 ? (
                            <EmptyState
                                description="An active customer and received representative stock are required."
                                title="Sale entry is not ready"
                            />
                        ) : (
                            <>
                                <nav aria-label="Sale progress" className="sale-wizard-steps">
                                    <ol>
                                        {wizardSteps.map((step) => (
                                            <li
                                                className={
                                                    step.number === wizardStep
                                                        ? 'is-current'
                                                        : step.number < wizardStep
                                                          ? 'is-complete'
                                                          : ''
                                                }
                                                key={step.number}
                                            >
                                                <button
                                                    aria-current={step.number === wizardStep ? 'step' : undefined}
                                                    disabled={step.number > wizardStep}
                                                    onClick={() => {
                                                        setError('');
                                                        setFields({});
                                                        setWizardStep(step.number);
                                                    }}
                                                    type="button"
                                                >
                                                    <span>{step.number}</span>
                                                    <strong>{step.label}</strong>
                                                </button>
                                            </li>
                                        ))}
                                    </ol>
                                </nav>
                                <section
                                    aria-labelledby={`sale-step-${wizardStep}-title`}
                                    className="sale-wizard-panel"
                                >
                                    <header className="sale-wizard-panel__heading">
                                        <div>
                                            <p>Step {wizardStep} of 4</p>
                                            <h3 id={`sale-step-${wizardStep}-title`}>
                                                {wizardSteps[wizardStep - 1].label}
                                            </h3>
                                        </div>
                                        <small>
                                            {wizardStep === 1
                                                ? 'Add the customer and payment details.'
                                                : wizardStep === 2
                                                  ? 'Choose one or more products for this sale.'
                                                  : wizardStep === 3
                                                    ? 'Set the required quantity for every selected product.'
                                                    : 'Confirm the sale details before saving or posting.'}
                                        </small>
                                    </header>
                                    {wizardStep === 1 ? (
                                        <div className="sale-header-fields">
                                            <div className="ui-field sale-customer-picker" ref={customerPickerRef}>
                                                <label htmlFor="sale-customer-search">Customer</label>
                                                <div className="sale-customer-picker__control">
                                                    <Icon name="search" size={16} />
                                                    <input
                                                        aria-autocomplete="list"
                                                        aria-controls="sale-customer-options"
                                                        aria-expanded={customerPickerOpen}
                                                        autoComplete="off"
                                                        id="sale-customer-search"
                                                        onChange={(event) => {
                                                            setCustomerQuery(event.target.value);
                                                            setCustomerPickerOpen(true);
                                                        }}
                                                        onFocus={() => {
                                                            setCustomerQuery('');
                                                            setCustomerPickerOpen(true);
                                                        }}
                                                        placeholder="Search by customer name or code"
                                                        role="combobox"
                                                        value={
                                                            !customerPickerOpen && selectedCustomer
                                                                ? `${selectedCustomer.code} · ${selectedCustomer.name}`
                                                                : customerQuery
                                                        }
                                                    />
                                                    <button
                                                        aria-label="Toggle customer options"
                                                        onClick={() => {
                                                            setCustomerQuery('');
                                                            setCustomerPickerOpen((value) => !value);
                                                        }}
                                                        type="button"
                                                    >
                                                        <Icon name="chevronDown" size={15} />
                                                    </button>
                                                </div>
                                                {customerPickerOpen ? (
                                                    <div
                                                        aria-label="Customer options"
                                                        className="sale-customer-picker__options"
                                                        id="sale-customer-options"
                                                        role="listbox"
                                                    >
                                                        {filteredCustomers.length > 0 ? (
                                                            filteredCustomers.map((customer) => (
                                                                <button
                                                                    aria-selected={customer.id === form.customer_id}
                                                                    key={customer.id}
                                                                    onClick={() => chooseCustomer(customer.id)}
                                                                    role="option"
                                                                    type="button"
                                                                >
                                                                    <span>
                                                                        <strong>{customer.name}</strong>
                                                                        <small>{customer.code}</small>
                                                                    </span>
                                                                    <span>
                                                                        <strong>
                                                                            {customer.credit_allowed
                                                                                ? money(customer.available_credit)
                                                                                : 'Cash only'}
                                                                        </strong>
                                                                        <small>
                                                                            {customer.credit_allowed
                                                                                ? 'credit available'
                                                                                : 'credit disabled'}
                                                                        </small>
                                                                    </span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <p>No customers match “{customerQuery}”.</p>
                                                        )}
                                                    </div>
                                                ) : null}
                                                {fields.customer_id?.[0] ? (
                                                    <small className="ui-field__error">{fields.customer_id[0]}</small>
                                                ) : null}
                                            </div>
                                            <fieldset className="sale-payment-picker">
                                                <legend>Payment type</legend>
                                                <div>
                                                    <label
                                                        className={form.payment_type === 'cash' ? 'is-selected' : ''}
                                                    >
                                                        <input
                                                            aria-label="Cash"
                                                            checked={form.payment_type === 'cash'}
                                                            name="payment_type"
                                                            onChange={() =>
                                                                setForm((value) => ({ ...value, payment_type: 'cash' }))
                                                            }
                                                            type="radio"
                                                            value="cash"
                                                        />
                                                        <Icon name="cash" size={17} />
                                                        <span>
                                                            <strong>Cash</strong>
                                                            <small>Collect immediately</small>
                                                        </span>
                                                    </label>
                                                    <label
                                                        className={form.payment_type === 'credit' ? 'is-selected' : ''}
                                                    >
                                                        <input
                                                            aria-label="Credit"
                                                            checked={form.payment_type === 'credit'}
                                                            disabled={!selectedCustomer?.credit_allowed}
                                                            name="payment_type"
                                                            onChange={() =>
                                                                setForm((value) => ({
                                                                    ...value,
                                                                    payment_type: 'credit',
                                                                }))
                                                            }
                                                            type="radio"
                                                            value="credit"
                                                        />
                                                        <Icon name="customers" size={17} />
                                                        <span>
                                                            <strong>Credit</strong>
                                                            <small>Use available credit</small>
                                                        </span>
                                                    </label>
                                                </div>
                                                {fields.payment_type?.[0] ? (
                                                    <small className="ui-field__error">{fields.payment_type[0]}</small>
                                                ) : null}
                                            </fieldset>
                                            {selectedCustomer ? (
                                                <section
                                                    aria-label="Customer credit status"
                                                    aria-live="polite"
                                                    className={`sale-credit-status ${selectedCustomer.credit_allowed ? 'is-available' : 'is-disabled'}`}
                                                >
                                                    <div className="sale-credit-status__heading">
                                                        <span>
                                                            <Icon name="customers" size={17} />
                                                        </span>
                                                        <div>
                                                            <small>{selectedCustomer.code}</small>
                                                            <strong>{selectedCustomer.name}</strong>
                                                        </div>
                                                        <span
                                                            aria-label={`Credit available: ${selectedCustomer.credit_allowed ? 'Yes' : 'No'}`}
                                                            className={`sale-credit-status__indicator ${selectedCustomer.credit_allowed ? 'is-yes' : 'is-no'}`}
                                                            role="img"
                                                            title={`Credit available: ${selectedCustomer.credit_allowed ? 'Yes' : 'No'}`}
                                                        />
                                                    </div>
                                                    <dl>
                                                        <div>
                                                            <dt>Available</dt>
                                                            <dd>
                                                                {selectedCustomer.credit_allowed
                                                                    ? money(selectedCustomer.available_credit)
                                                                    : '—'}
                                                            </dd>
                                                        </div>
                                                        <div>
                                                            <dt>Outstanding</dt>
                                                            <dd>{money(selectedCustomer.outstanding_amount)}</dd>
                                                        </div>
                                                        <div>
                                                            <dt>Credit limit</dt>
                                                            <dd>{money(selectedCustomer.credit_limit)}</dd>
                                                        </div>
                                                    </dl>
                                                </section>
                                            ) : (
                                                <div className="sale-credit-status sale-credit-status--empty">
                                                    <Icon name="search" size={17} />
                                                    <span>
                                                        <strong>Select a customer</strong>
                                                        <small>Credit availability will appear here.</small>
                                                    </span>
                                                </div>
                                            )}
                                            <label className="ui-field sale-notes">
                                                <span>Notes</span>
                                                <input
                                                    onChange={(event) =>
                                                        setForm((value) => ({
                                                            ...value,
                                                            notes: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="Optional delivery or invoice note"
                                                    value={form.notes}
                                                />
                                            </label>
                                        </div>
                                    ) : null}
                                    {wizardStep === 2 ? (
                                        <div className="sale-product-selector" role="group" aria-label="Products">
                                            {options.products.map((product) => {
                                                const selected = form.items.some(
                                                    (item) => item.product_id === product.id,
                                                );
                                                return (
                                                    <label
                                                        className={`sale-product-option ${selected ? 'is-selected' : ''}`}
                                                        key={product.id}
                                                    >
                                                        <input
                                                            aria-label={`Select ${product.name}`}
                                                            checked={selected}
                                                            onChange={() => toggleProduct(product.id)}
                                                            type="checkbox"
                                                        />
                                                        <span className="sale-product-option__icon">
                                                            <Icon name="box" size={17} />
                                                        </span>
                                                        <span className="sale-product-option__identity">
                                                            <strong>{product.name}</strong>
                                                            <small>
                                                                {product.sku} · {product.unit}
                                                            </small>
                                                        </span>
                                                        <span className="sale-product-option__stock">
                                                            <strong>{product.quantity}</strong>
                                                            <small>available</small>
                                                        </span>
                                                        <span className="sale-product-option__price">
                                                            <strong>{money(product.selling_price)}</strong>
                                                            <small>unit price</small>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                            {fields.items?.[0] ? (
                                                <small className="ui-field__error sale-wizard-error">
                                                    {fields.items[0]}
                                                </small>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    {wizardStep === 3 ? (
                                        <div className="sale-quantity-list">
                                            {form.items.map((line, index) => {
                                                const product = options.products.find(
                                                    (item) => item.id === line.product_id,
                                                );
                                                if (!product) return null;
                                                return (
                                                    <article key={product.id}>
                                                        <span className="sale-quantity-list__icon">
                                                            <Icon name="box" size={17} />
                                                        </span>
                                                        <div className="sale-quantity-list__identity">
                                                            <strong>{product.name}</strong>
                                                            <small>
                                                                {product.sku} · {product.quantity} available
                                                            </small>
                                                        </div>
                                                        <label className="ui-field sale-quantity-list__field">
                                                            <input
                                                                aria-label={`Quantity for ${product.name}`}
                                                                max={product.quantity}
                                                                min={1}
                                                                onChange={(event) =>
                                                                    setForm((value) => ({
                                                                        ...value,
                                                                        items: value.items.map((item, itemIndex) =>
                                                                            itemIndex === index
                                                                                ? {
                                                                                      ...item,
                                                                                      quantity: Number(
                                                                                          event.target.value,
                                                                                      ),
                                                                                  }
                                                                                : item,
                                                                        ),
                                                                    }))
                                                                }
                                                                required
                                                                type="number"
                                                                value={line.quantity}
                                                            />
                                                            {fields[`items.${index}.quantity`]?.[0] ? (
                                                                <small className="ui-field__error">
                                                                    {fields[`items.${index}.quantity`][0]}
                                                                </small>
                                                            ) : null}
                                                        </label>
                                                        <div className="sale-quantity-list__total">
                                                            <small>Line total</small>
                                                            <strong>
                                                                {money(product.selling_price * line.quantity)}
                                                            </strong>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    {wizardStep === 4 ? (
                                        <div className="sale-review">
                                            <div className="sale-review__information">
                                                <dl>
                                                    <div>
                                                        <dt>Customer</dt>
                                                        <dd>{selectedCustomer?.name ?? '—'}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Payment</dt>
                                                        <dd>{form.payment_type}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>Notes</dt>
                                                        <dd>{form.notes || 'No notes'}</dd>
                                                    </div>
                                                </dl>
                                                <Button onClick={() => setWizardStep(1)} tone="ghost">
                                                    Edit information
                                                </Button>
                                            </div>
                                            <div className="sale-review__items">
                                                {form.items.map((line) => {
                                                    const product = options.products.find(
                                                        (item) => item.id === line.product_id,
                                                    );
                                                    if (!product) return null;
                                                    return (
                                                        <article key={product.id}>
                                                            <div>
                                                                <strong>{product.name}</strong>
                                                                <small>{product.sku}</small>
                                                            </div>
                                                            <span>
                                                                {line.quantity} × {money(product.selling_price)}
                                                            </span>
                                                            <strong>
                                                                {money(line.quantity * product.selling_price)}
                                                            </strong>
                                                        </article>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : null}
                                </section>
                                <footer className="sale-form-actions">
                                    {wizardStep > 1 ? <Button onClick={goBack}>Back</Button> : <span />}
                                    <div>
                                        {wizardStep < 4 ? (
                                            <Button onClick={continueWizard} tone="primary">
                                                {wizardStep === 1
                                                    ? 'Continue to products'
                                                    : wizardStep === 2
                                                      ? 'Continue to quantity'
                                                      : 'Review sale'}
                                            </Button>
                                        ) : (
                                            <>
                                                <Button disabled={saving} requiresOnline type="submit">
                                                    {saving ? 'Saving…' : 'Save draft'}
                                                </Button>
                                                <Button
                                                    disabled={saving}
                                                    onClick={() => void save(true)}
                                                    requiresOnline
                                                    tone="primary"
                                                >
                                                    {saving ? 'Posting…' : 'Post sale'}
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </footer>
                            </>
                        )}
                    </form>
                </div>
            ) : (
                <section className="sales-section sales-history">
                    <header>
                        <div>
                            <p className="ui-eyebrow">Own transactions</p>
                            <h2>Recent sales</h2>
                        </div>
                        <Button icon="plus" onClick={() => navigate('/sales/new-sale')} tone="primary">
                            New sale
                        </Button>
                    </header>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading sales…
                        </div>
                    ) : sales.length === 0 ? (
                        <EmptyState
                            description="Saved drafts and posted sales will appear here."
                            title="No sales yet"
                        />
                    ) : (
                        <div className="sales-history-list">
                            {sales.map((sale) => (
                                <article key={sale.id}>
                                    <Link className="sales-history__identity" to={`/sales/sales-history/${sale.id}`}>
                                        <span>
                                            <Icon
                                                name={sale.payment_type === 'cash' ? 'cash' : 'customers'}
                                                size={16}
                                            />
                                        </span>
                                        <div>
                                            <strong>{sale.reference}</strong>
                                            <small>
                                                {sale.customer.name} · {dateTime(sale.created_at)}
                                            </small>
                                        </div>
                                    </Link>
                                    <div className="sales-history__amount">
                                        <strong>{money(sale.total_amount)}</strong>
                                        <small>
                                            {sale.total_quantity} units · {sale.payment_type}
                                        </small>
                                    </div>
                                    <div className="sales-history__end">
                                        <StatusBadge tone={tone(sale.status)}>{sale.status}</StatusBadge>
                                        {sale.status !== 'draft' ? (
                                            <>
                                                <IconButton
                                                    icon="print"
                                                    label={`Print invoice ${sale.reference}`}
                                                    onClick={() => {
                                                        if (!printInvoice(sale, branding)) {
                                                            setError('Allow pop-ups to print the invoice.');
                                                        }
                                                    }}
                                                />
                                                <Link
                                                    aria-label={`View ${sale.reference}`}
                                                    className="ui-icon-button ui-icon-button--secondary sales-history__detail-link"
                                                    title={`View ${sale.reference}`}
                                                    to={`/sales/sales-history/${sale.id}`}
                                                >
                                                    <Icon name="chevronRight" size={17} />
                                                </Link>
                                            </>
                                        ) : null}
                                        {sale.status === 'draft' ? (
                                            <div className="sales-history__menu">
                                                <IconButton
                                                    aria-controls={`sale-actions-${sale.id}`}
                                                    aria-expanded={actionMenuSaleId === sale.id}
                                                    aria-haspopup="menu"
                                                    className="sales-history__menu-trigger"
                                                    icon="moreVertical"
                                                    label={`Actions for ${sale.reference}`}
                                                    onClick={() =>
                                                        setActionMenuSaleId((current) =>
                                                            current === sale.id ? null : sale.id,
                                                        )
                                                    }
                                                />
                                                {actionMenuSaleId === sale.id ? (
                                                    <div
                                                        aria-label={`Actions for ${sale.reference}`}
                                                        className="sales-history__action-menu"
                                                        id={`sale-actions-${sale.id}`}
                                                        role="menu"
                                                    >
                                                        <Link
                                                            className="ui-button ui-button--ghost sales-history__menu-item"
                                                            role="menuitem"
                                                            to={`/sales/sales-history/${sale.id}`}
                                                        >
                                                            <Icon name="sales" size={16} />
                                                            <span>View</span>
                                                        </Link>
                                                        <Button
                                                            className="sales-history__menu-item"
                                                            icon="edit"
                                                            onClick={() => edit(sale)}
                                                            role="menuitem"
                                                            tone="ghost"
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            className="sales-history__menu-item"
                                                            disabled={saving}
                                                            icon="check"
                                                            onClick={() => void postDraft(sale)}
                                                            requiresOnline
                                                            role="menuitem"
                                                            tone="ghost"
                                                        >
                                                            Post
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                    <Pagination
                        label="Sales history"
                        loading={loading}
                        meta={salesMeta}
                        onPageChange={(page) => {
                            setLoading(true);
                            setHistoryPage(page);
                        }}
                    />
                </section>
            )}
        </div>
    );
}

export function NewSalePage() {
    const [searchParams] = useSearchParams();
    const editId = Number(searchParams.get('edit')) || 0;
    return <SalesWorkspacePage editId={editId} key={editId || 'new'} view="entry" />;
}

export function SalesHistoryPage() {
    return <SalesWorkspacePage view="history" />;
}
