import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import {
    SaleApiError,
    saleApi,
    type Sale,
    type SaleCustomerOption,
    type SaleInput,
    type SaleOptions,
    type SalesCustomerInput,
} from '../../services/sales';
import { Icon } from '../../ui/icons';
import { InvoicePrintButton } from '../../ui/invoice-print-dialog';
import { editableNumber } from '../../ui/form-values';
import { Button, Dialog, EmptyState, IconButton, Pagination, StatusBadge } from '../../ui/primitives';

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
type CreationLocation = { accuracy: number; latitude: number; longitude: number };
type LocationStatus = 'idle' | 'locating' | 'ready' | 'error';
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
            product_unit_id: item.unit?.id,
            quantity: item.quantity,
            foc_product_unit_id: item.foc_unit?.id,
            foc_quantity: item.foc_quantity,
        })),
    };
}

type SalesWorkspaceView = 'entry' | 'history';

function SalesWorkspacePage({ editId = 0, view }: { editId?: number; view: SalesWorkspaceView }) {
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
    const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
    const [creationLocation, setCreationLocation] = useState<CreationLocation | null>(null);
    const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
    const [locationMessage, setLocationMessage] = useState('');
    const [locationRequest, setLocationRequest] = useState(0);
    const customerPickerRef = useRef<HTMLDivElement>(null);
    const lastAutomaticLocationRequest = useRef(-1);
    const captureLocation = useCallback((): Promise<CreationLocation | null> => {
        if (!navigator.geolocation) {
            setLocationStatus('error');
            setLocationMessage('Location is not supported by this device or browser.');
            return Promise.resolve(null);
        }
        setLocationStatus('locating');
        setLocationMessage('Waiting for device location permission…');
        return new Promise((resolve) =>
            navigator.geolocation.getCurrentPosition(
                ({ coords }) => {
                    const nextLocation = {
                        accuracy: coords.accuracy,
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                    };
                    setCreationLocation(nextLocation);
                    setLocationStatus('ready');
                    setLocationMessage(`Location ready · accuracy about ${Math.round(coords.accuracy)} m`);
                    setFields((current) => ({ ...current, creation_location: [] }));
                    resolve(nextLocation);
                },
                (locationError) => {
                    setCreationLocation(null);
                    setLocationStatus('error');
                    setLocationMessage(
                        locationError.code === locationError.PERMISSION_DENIED
                            ? 'Location permission is required to create a sale. Enable it in browser settings, then retry.'
                            : 'Current location could not be determined. Check GPS or network access, then retry.',
                    );
                    resolve(null);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
            ),
        );
    }, []);
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
        if (view === 'entry' && !editId && lastAutomaticLocationRequest.current !== locationRequest) {
            lastAutomaticLocationRequest.current = locationRequest;
            void captureLocation();
        }
    }, [captureLocation, editId, locationRequest, view]);
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
    const selectedRegionId = selectedCustomer?.way?.region?.id ?? 0;
    const selectedRegionName = selectedCustomer?.way?.region?.name ?? 'select customer';
    const productUnits = useCallback(
        (product: SaleOptions['products'][number]) =>
            product.units?.length
                ? product.units
                : [
                      {
                          id: 0,
                          name: product.unit,
                          conversion_factor: 1,
                          is_base: true,
                          is_default_selling: true,
                          prices: selectedCustomer
                              ? [{ region_id: selectedRegionId, price: product.selling_price }]
                              : [],
                      },
                  ],
        [selectedCustomer, selectedRegionId],
    );
    const lineUnit = useCallback(
        (line: SaleInput['items'][number], product = options.products.find((item) => item.id === line.product_id)) =>
            (product ? productUnits(product) : []).find((unit) => unit.id === line.product_unit_id) ??
            (product ? productUnits(product) : []).find((unit) => unit.is_default_selling) ??
            (product ? productUnits(product) : [])[0],
        [options.products, productUnits],
    );
    const linePrice = useCallback(
        (line: SaleInput['items'][number]) =>
            lineUnit(line)?.prices?.find((price) => price.region_id === selectedRegionId)?.price ?? 0,
        [lineUnit, selectedRegionId],
    );
    const lineFocUnit = useCallback(
        (line: SaleInput['items'][number], product = options.products.find((item) => item.id === line.product_id)) =>
            (product ? productUnits(product) : []).find((unit) => unit.id === line.foc_product_unit_id) ??
            lineUnit(line, product),
        [lineUnit, options.products, productUnits],
    );
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
        () => form.items.reduce((total, line) => total + line.quantity * linePrice(line), 0),
        [form.items, linePrice],
    );
    const paidBaseTotal = useMemo(
        () => form.items.reduce((total, line) => total + line.quantity * (lineUnit(line)?.conversion_factor ?? 1), 0),
        [form.items, lineUnit],
    );
    const focBaseTotal = useMemo(
        () =>
            form.items.reduce(
                (total, line) => total + (line.foc_quantity ?? 0) * (lineFocUnit(line)?.conversion_factor ?? 1),
                0,
            ),
        [form.items, lineFocUnit],
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
        setCreationLocation(null);
        setLocationStatus('idle');
        setLocationMessage('');
        setLocationRequest((value) => value + 1);
        navigate('/sales/new-sale', { replace: true });
    };
    const validate = (forPosting: boolean) => {
        const next: Record<string, string[]> = {};
        if (!form.customer_id) next.customer_id = ['Select a customer.'];
        if (!editing && !creationLocation)
            next.creation_location = ['Capture the device location before creating this sale.'];
        const seen = new Set<number>();
        form.items.forEach((line, index) => {
            const product = options.products.find((item) => item.id === line.product_id);
            if (!product) next[`items.${index}.product_id`] = ['Select an available product.'];
            else if (seen.has(line.product_id))
                next[`items.${index}.product_id`] = ['Each product can appear only once.'];
            else seen.add(line.product_id);
            if (!Number.isInteger(line.quantity) || line.quantity < 1)
                next[`items.${index}.quantity`] = ['Enter a whole quantity of at least 1.'];
            else if (
                forPosting &&
                product &&
                line.quantity * (lineUnit(line, product)?.conversion_factor ?? 1) > product.quantity
            )
                next[`items.${index}.quantity`] = [`Only ${product.quantity} base units are currently available.`];
            if (!Number.isInteger(line.foc_quantity ?? 0) || (line.foc_quantity ?? 0) < 0)
                next[`items.${index}.foc_quantity`] = ['Enter a whole FOC quantity of 0 or more.'];
            else if (
                (line.foc_quantity ?? 0) * (lineFocUnit(line, product)?.conversion_factor ?? 1) >
                (product?.foc_quantity ?? 0)
            )
                next[`items.${index}.foc_quantity`] = [
                    `Only ${product?.foc_quantity ?? 0} FOC base units are available.`,
                ];
            if (
                product &&
                selectedCustomer &&
                linePrice(line) === 0 &&
                !lineUnit(line)?.prices?.some((price) => price.region_id === selectedRegionId)
            )
                next[`items.${index}.product_unit_id`] = ['This unit has no price for the customer region.'];
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
        if (step === 1 && !editing && !creationLocation)
            next.creation_location = ['Capture the device location before continuing.'];
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
                else if (
                    product &&
                    line.quantity * (lineUnit(line, product)?.conversion_factor ?? 1) > product.quantity
                )
                    next[`items.${index}.quantity`] = [
                        `Only ${product.quantity} ${
                            (lineUnit(line, product)?.conversion_factor ?? 1) === 1 ? 'units' : 'base units'
                        } are currently available.`,
                    ];
                if (!Number.isInteger(line.foc_quantity ?? 0) || (line.foc_quantity ?? 0) < 0)
                    next[`items.${index}.foc_quantity`] = ['Enter a whole FOC quantity of 0 or more.'];
                else if (
                    product &&
                    (line.foc_quantity ?? 0) * (lineFocUnit(line, product)?.conversion_factor ?? 1) >
                        (product.foc_quantity ?? 0)
                )
                    next[`items.${index}.foc_quantity`] = [
                        `Only ${product.foc_quantity ?? 0} FOC base units are available.`,
                    ];
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
        const selectedProduct = options.products.find((product) => product.id === productId);
        setFields({});
        setForm((value) => ({
            ...value,
            items: value.items.some((item) => item.product_id === productId)
                ? value.items.filter((item) => item.product_id !== productId)
                : [
                      ...value.items,
                      {
                          product_id: productId,
                          product_unit_id: selectedProduct
                              ? productUnits(selectedProduct).find((unit) => unit.is_default_selling)?.id
                              : undefined,
                          quantity: 1,
                          foc_quantity: 0,
                      },
                  ],
        }));
    };
    const save = async (postAfter: boolean) => {
        if (!validate(postAfter)) return;
        setSaving(true);
        setError('');
        try {
            const latestLocation = editing ? null : await captureLocation();
            if (!editing && !latestLocation) {
                setError('Current device location is required before this sale can be created.');
                return;
            }
            const response = editing
                ? await saleApi.update(editing.id, form)
                : await saleApi.create({
                      ...form,
                      creation_latitude: latestLocation!.latitude,
                      creation_longitude: latestLocation!.longitude,
                      location_accuracy_meters: latestLocation!.accuracy,
                  });
            const sale = response.data;
            if (postAfter) {
                if (
                    !window.confirm(
                        `Post ${sale.reference} for ${money(sale.total_amount)}? ${paidBaseTotal} paid and ${focBaseTotal} FOC base units will leave stock. ${sale.payment_type === 'cash' ? 'Cash hold' : 'Customer credit'} will update immediately.`,
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
            <NewCustomerDialog
                onClose={() => setCustomerDialogOpen(false)}
                onCreated={(customer) => {
                    setOptions((value) => ({
                        ...value,
                        customers: [...value.customers, customer].sort((left, right) =>
                            left.name.localeCompare(right.name),
                        ),
                    }));
                    setForm((value) => ({ ...value, customer_id: customer.id, payment_type: 'cash' }));
                    setCustomerQuery(`${customer.code} · ${customer.name}`);
                    setCustomerPickerOpen(false);
                    setCustomerDialogOpen(false);
                    showNotice(`${customer.name} created as a cash-only customer.`);
                }}
                open={customerDialogOpen}
                regions={options.representative.regions ?? []}
            />
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
                            {editing ? (
                                <Button onClick={reset}>New</Button>
                            ) : (
                                <Button
                                    icon="plus"
                                    onClick={() => {
                                        setCustomerPickerOpen(false);
                                        setCustomerDialogOpen(true);
                                    }}
                                    tone="ghost"
                                >
                                    New customer
                                </Button>
                            )}
                        </header>
                        {loading ? (
                            <div className="ui-loading">
                                <span />
                                Loading sale options…
                            </div>
                        ) : options.products.length === 0 ? (
                            <EmptyState
                                description="Received representative stock is required before creating a sale."
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
                                                    {selectedCustomer.credit_allowed ? (
                                                        <dl>
                                                            <div>
                                                                <dt>Available</dt>
                                                                <dd>{money(selectedCustomer.available_credit)}</dd>
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
                                                    ) : (
                                                        <div className="sale-credit-status__notice" role="status">
                                                            <Icon name="warning" size={16} />
                                                            <span>
                                                                <strong>Credit not allowed</strong>
                                                                <small>
                                                                    This customer is configured for cash payments only.
                                                                </small>
                                                            </span>
                                                        </div>
                                                    )}
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
                                            <section
                                                aria-label="Sale creation location"
                                                aria-live="polite"
                                                className={`sale-location-status is-${editing ? 'stored' : locationStatus}`}
                                            >
                                                <span className="sale-location-status__icon">
                                                    <Icon
                                                        name={
                                                            editing || locationStatus === 'ready'
                                                                ? 'check'
                                                                : locationStatus === 'error'
                                                                  ? 'warning'
                                                                  : 'location'
                                                        }
                                                        size={17}
                                                    />
                                                </span>
                                                <span className="sale-location-status__copy">
                                                    <strong>
                                                        {editing
                                                            ? 'Original sale location preserved'
                                                            : locationStatus === 'ready'
                                                              ? 'Device location captured'
                                                              : locationStatus === 'locating'
                                                                ? 'Getting current location'
                                                                : 'Device location required'}
                                                    </strong>
                                                    <small>
                                                        {editing
                                                            ? 'Editing this draft will not replace where it was created.'
                                                            : locationMessage ||
                                                              'The office will receive this point with the sale record.'}
                                                    </small>
                                                </span>
                                                {!editing && locationStatus !== 'ready' ? (
                                                    <Button
                                                        disabled={locationStatus === 'locating'}
                                                        onClick={() => void captureLocation()}
                                                    >
                                                        {locationStatus === 'locating' ? 'Locating…' : 'Retry location'}
                                                    </Button>
                                                ) : null}
                                                {fields.creation_location?.[0] ? (
                                                    <small className="ui-field__error">
                                                        {fields.creation_location[0]}
                                                    </small>
                                                ) : null}
                                            </section>
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
                                                        <span className="sale-product-option__check" aria-hidden="true">
                                                            {selected ? <Icon name="check" size={13} /> : null}
                                                        </span>
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
                                                            <span>
                                                                <strong>{product.quantity}</strong>
                                                                <small>paid</small>
                                                            </span>
                                                            <span>
                                                                <strong>{product.foc_quantity ?? 0}</strong>
                                                                <small>FOC</small>
                                                            </span>
                                                        </span>
                                                        <span className="sale-product-option__price">
                                                            <strong>
                                                                {money(
                                                                    linePrice({
                                                                        product_id: product.id,
                                                                        product_unit_id: productUnits(product).find(
                                                                            (unit) => unit.is_default_selling,
                                                                        )?.id,
                                                                        quantity: 1,
                                                                    }),
                                                                )}
                                                            </strong>
                                                            <small>{selectedRegionName} price</small>
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
                                                                {product.quantity} paid · {product.foc_quantity ?? 0}{' '}
                                                                FOC base available
                                                            </small>
                                                        </div>
                                                        <div className="sale-quantity-list__controls sale-quantity-list__controls--paid">
                                                            <label className="ui-field">
                                                                <span>Selling unit</span>
                                                                <select
                                                                    onChange={(event) =>
                                                                        setForm((value) => ({
                                                                            ...value,
                                                                            items: value.items.map((item, itemIndex) =>
                                                                                itemIndex === index
                                                                                    ? {
                                                                                          ...item,
                                                                                          product_unit_id: Number(
                                                                                              event.target.value,
                                                                                          ),
                                                                                      }
                                                                                    : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    value={lineUnit(line, product)?.id}
                                                                >
                                                                    {productUnits(product).map((unit) => (
                                                                        <option
                                                                            disabled={
                                                                                !unit.prices?.some(
                                                                                    (price) =>
                                                                                        price.region_id ===
                                                                                        selectedRegionId,
                                                                                )
                                                                            }
                                                                            key={unit.id}
                                                                            value={unit.id}
                                                                        >
                                                                            {unit.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                            <label className="ui-field">
                                                                <span>Paid quantity</span>
                                                                <input
                                                                    aria-label={`Quantity for ${product.name}`}
                                                                    inputMode="numeric"
                                                                    onChange={(event) =>
                                                                        setForm((value) => ({
                                                                            ...value,
                                                                            items: value.items.map((item, itemIndex) =>
                                                                                itemIndex === index
                                                                                    ? {
                                                                                          ...item,
                                                                                          quantity: editableNumber(
                                                                                              event.target.value.replace(
                                                                                                  /\D/g,
                                                                                                  '',
                                                                                              ),
                                                                                          ),
                                                                                      }
                                                                                    : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    pattern="[0-9]*"
                                                                    required
                                                                    type="text"
                                                                    value={line.quantity}
                                                                />
                                                                {fields[`items.${index}.quantity`]?.[0] ? (
                                                                    <small className="ui-field__error">
                                                                        {fields[`items.${index}.quantity`][0]}
                                                                    </small>
                                                                ) : null}
                                                            </label>
                                                        </div>
                                                        <div className="sale-quantity-list__controls sale-quantity-list__controls--foc">
                                                            <label className="ui-field">
                                                                <span>FOC unit</span>
                                                                <select
                                                                    disabled={(product.foc_quantity ?? 0) <= 0}
                                                                    onChange={(event) =>
                                                                        setForm((value) => ({
                                                                            ...value,
                                                                            items: value.items.map((item, itemIndex) =>
                                                                                itemIndex === index
                                                                                    ? {
                                                                                          ...item,
                                                                                          foc_product_unit_id: Number(
                                                                                              event.target.value,
                                                                                          ),
                                                                                      }
                                                                                    : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    value={
                                                                        line.foc_product_unit_id ??
                                                                        lineUnit(line, product)?.id
                                                                    }
                                                                >
                                                                    {productUnits(product).map((unit) => (
                                                                        <option key={unit.id} value={unit.id}>
                                                                            {unit.name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                            <label className="ui-field">
                                                                <span>FOC quantity</span>
                                                                <input
                                                                    disabled={(product.foc_quantity ?? 0) <= 0}
                                                                    inputMode="numeric"
                                                                    onChange={(event) =>
                                                                        setForm((value) => ({
                                                                            ...value,
                                                                            items: value.items.map((item, itemIndex) =>
                                                                                itemIndex === index
                                                                                    ? {
                                                                                          ...item,
                                                                                          foc_quantity: editableNumber(
                                                                                              event.target.value.replace(
                                                                                                  /\D/g,
                                                                                                  '',
                                                                                              ),
                                                                                          ),
                                                                                          foc_product_unit_id:
                                                                                              item.foc_product_unit_id ??
                                                                                              lineUnit(item, product)
                                                                                                  ?.id,
                                                                                      }
                                                                                    : item,
                                                                            ),
                                                                        }))
                                                                    }
                                                                    pattern="[0-9]*"
                                                                    type="text"
                                                                    value={line.foc_quantity ?? 0}
                                                                />
                                                                {fields[`items.${index}.foc_quantity`]?.[0] ? (
                                                                    <small className="ui-field__error">
                                                                        {fields[`items.${index}.foc_quantity`][0]}
                                                                    </small>
                                                                ) : null}
                                                            </label>
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
                                                            <span className="sale-review__calculation">
                                                                <span>
                                                                    {line.quantity} {lineUnit(line, product)?.name} ×{' '}
                                                                    {money(linePrice(line))}
                                                                </span>
                                                                <small>
                                                                    FOC: {line.foc_quantity ?? 0}{' '}
                                                                    {lineFocUnit(line, product)?.name} ·{' '}
                                                                    {(line.foc_quantity ?? 0) *
                                                                        (lineFocUnit(line, product)
                                                                            ?.conversion_factor ?? 1)}{' '}
                                                                    base
                                                                </small>
                                                            </span>
                                                            <strong>{money(line.quantity * linePrice(line))}</strong>
                                                        </article>
                                                    );
                                                })}
                                                <div
                                                    className="sale-review__stock-summary"
                                                    aria-label="Stock movement summary"
                                                    role="region"
                                                >
                                                    <span>
                                                        <small>Paid base units</small>
                                                        <strong>{paidBaseTotal}</strong>
                                                    </span>
                                                    <span>
                                                        <small>FOC base units</small>
                                                        <strong>{focBaseTotal}</strong>
                                                    </span>
                                                </div>
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
                                                <InvoicePrintButton
                                                    iconOnly
                                                    onBlocked={() =>
                                                        setError('Allow pop-ups to print the invoice.')
                                                    }
                                                    sale={sale}
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

const emptyCustomerForm: SalesCustomerInput = {
    address: '',
    customer_type: 'Shop',
    name: '',
    notes: '',
    phone: '',
    region: '',
    township: '',
    way_id: 0,
};

function NewCustomerDialog({
    onClose,
    onCreated,
    open,
    regions,
}: {
    onClose: () => void;
    onCreated: (customer: SaleCustomerOption) => void;
    open: boolean;
    regions: Array<{ id: number; name: string; ways: Array<{ id: number; code: string; name: string }> }>;
}) {
    const [form, setForm] = useState<SalesCustomerInput>(emptyCustomerForm);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        if (!open) return;
        setForm(emptyCustomerForm);
        setErrors({});
    }, [open]);
    const change = (field: keyof SalesCustomerInput, value: string | number) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submitCustomer = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        setErrors({});
        try {
            const response = await saleApi.createCustomer(form);
            onCreated(response.customer);
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
        <Dialog
            description="The customer is assigned to your warehouse. Credit is disabled and the credit limit starts at 0."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={saving}
                        form="sales-new-customer-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Creating…' : 'Create customer'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title="New customer"
        >
            <form className="management-form" id="sales-new-customer-form" onSubmit={submitCustomer}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>Customer name</span>
                        <input
                            autoFocus
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        {fieldError('name')}
                    </label>
                    <label className="ui-field">
                        <span>Customer type</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('customer_type', event.target.value)}
                            value={form.customer_type}
                        />
                        {fieldError('customer_type')}
                    </label>
                    <label className="ui-field">
                        <span>Phone</span>
                        <input
                            maxLength={50}
                            onChange={(event) => change('phone', event.target.value)}
                            value={form.phone}
                        />
                        {fieldError('phone')}
                    </label>
                    <label className="ui-field">
                        <span>Region</span>
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
                    </label>
                    <label className="ui-field">
                        <span>Way</span>
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
                        {fieldError('way_id')}
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Address</span>
                        <input
                            maxLength={500}
                            onChange={(event) => change('address', event.target.value)}
                            value={form.address}
                        />
                        {fieldError('address')}
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>Notes</span>
                        <textarea
                            maxLength={1000}
                            onChange={(event) => change('notes', event.target.value)}
                            rows={3}
                            value={form.notes}
                        />
                        {fieldError('notes')}
                    </label>
                </div>
            </form>
        </Dialog>
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
