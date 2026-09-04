import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { PaginationMeta } from '../../services/administration';
import {
    SaleApiError,
    saleApi,
    type Sale,
    type SaleCustomerOption,
    type SaleInput,
    type SaleFilters,
    type SaleHistoryOptions,
    type SaleOptions,
    type OwnSaleSummary,
    type SalesCustomerInput,
} from '../../services/sales';
import { Icon } from '../../ui/icons';
import { InvoicePrintButton } from '../../ui/invoice-print-dialog';
import { editableNumber } from '../../ui/form-values';
import { Button, Dialog, Drawer, EmptyState, IconButton, Pagination, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const emptyOptions: SaleOptions = {
    cash_hold: 0,
    customers: [],
    payment_methods: [],
    products: [],
    representative: { code: '', id: 0, name: '' },
};
const emptyForm: SaleInput = {
    customer_id: 0,
    items: [],
    notes: '',
    promotion_title: '',
    promotion_amount: 0,
    payment_type: 'cash',
    payment_method: 'cash',
};
const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 10,
    to: null,
    total: 0,
};
const emptyHistoryOptions: SaleHistoryOptions = { customers: [], products: [], trips: [] };
const emptyHistorySummary: OwnSaleSummary = { gross_sales: 0, cash_sales: 0, credit_sales: 0, units_sold: 0 };
const wizardSteps = [
    { label: 'Information', number: 1 },
    { label: 'Products', number: 2 },
    { label: 'Quantity', number: 3 },
    { label: 'Review & submit', number: 4 },
] as const;
type SaleWizardStep = (typeof wizardSteps)[number]['number'];
type CreationLocation = { accuracy: number; latitude: number; longitude: number };
type LocationStatus = 'idle' | 'locating' | 'ready' | 'error';
function message(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}
function tone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

function formFromSale(sale: Sale): SaleInput {
    return {
        customer_id: sale.customer.id,
        payment_type: sale.payment_type,
        payment_method: sale.payment_method ?? 'cash',
        notes: sale.notes ?? '',
        promotion_title: sale.promotion_title ?? '',
        promotion_amount: sale.promotion_amount ?? 0,
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
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const dateTime = (value: string | null) => (value ? formatDateTime(value) : '—');
    const navigate = useNavigate();
    const [options, setOptions] = useState(emptyOptions);
    const [sales, setSales] = useState<Sale[]>([]);
    const [salesMeta, setSalesMeta] = useState(emptyMeta);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyOptions, setHistoryOptions] = useState(emptyHistoryOptions);
    const [historySummary, setHistorySummary] = useState(emptyHistorySummary);
    const [historyFilters, setHistoryFilters] = useState<SaleFilters>({});
    const [historyDraft, setHistoryDraft] = useState<SaleFilters>({});
    const [historyFilterOpen, setHistoryFilterOpen] = useState(false);
    const [historyTripsLoading, setHistoryTripsLoading] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState<Sale | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const [actionMenuSaleId, setActionMenuSaleId] = useState<number | null>(null);
    const [wizardStep, setWizardStep] = useState<SaleWizardStep>(1);
    const [promotionExpanded, setPromotionExpanded] = useState(false);
    const [customerQuery, setCustomerQuery] = useState('');
    const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
    const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
    const [creationLocation, setCreationLocation] = useState<CreationLocation | null>(null);
    const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
    const [locationMessage, setLocationMessage] = useState('');
    const customerPickerRef = useRef<HTMLDivElement>(null);
    const captureLocation = useCallback((): Promise<CreationLocation | null> => {
        if (window.isSecureContext === false) {
            setLocationStatus('error');
            setLocationMessage(
                t('Chrome only allows location access on HTTPS or localhost. Open this app over HTTPS, then retry.'),
            );
            return Promise.resolve(null);
        }
        if (!navigator.geolocation) {
            setLocationStatus('error');
            setLocationMessage(t('Location is not supported by this device or browser.'));
            return Promise.resolve(null);
        }
        setLocationStatus('locating');
        setLocationMessage(t('Waiting for device location permission…'));
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
                    setLocationMessage(
                        t('Location ready · accuracy about {accuracy} m', {
                            accuracy: formatNumber(Math.round(coords.accuracy)),
                        }),
                    );
                    setFields((current) => ({ ...current, creation_location: [] }));
                    resolve(nextLocation);
                },
                (locationError) => {
                    setCreationLocation(null);
                    setLocationStatus('error');
                    setLocationMessage(
                        locationError.code === locationError.PERMISSION_DENIED
                            ? t(
                                  'Location permission is required to create a sale. Enable it in browser settings, then retry.',
                              )
                            : t('Current location could not be determined. Check GPS or network access, then retry.'),
                    );
                    resolve(null);
                },
                { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
            ),
        );
    }, [formatNumber, t]);
    const load = useCallback(async () => {
        try {
            const [nextOptions, history, editResponse] = await Promise.all([
                view === 'entry' ? saleApi.options() : Promise.resolve(null),
                view === 'history' ? saleApi.ownSales({ ...historyFilters, page: historyPage }) : Promise.resolve(null),
                view === 'entry' && editId ? saleApi.ownSale(editId) : Promise.resolve(null),
            ]);
            if (history) {
                setSales(history.data);
                setSalesMeta(history.meta);
                setHistorySummary(history.summary ?? emptyHistorySummary);
            }
            if (!nextOptions) {
                setError('');
                return;
            }
            const nextPaymentMethods = nextOptions.payment_methods ?? [
                { key: 'cash', name: 'Cash', adds_to_cash_hold: true, is_active: true },
                { key: 'banking', name: 'Banking', adds_to_cash_hold: false, is_active: true },
            ];
            const editSale = editResponse?.data.status === 'draft' ? editResponse.data : undefined;
            setOptions({ ...nextOptions, payment_methods: nextPaymentMethods });
            if (editSale) setEditing(editSale);
            setForm((value) => ({
                ...(editSale
                    ? formFromSale(editSale)
                    : {
                          ...value,
                          customer_id: value.customer_id,
                          payment_method: nextPaymentMethods.some((method) => method.key === value.payment_method)
                              ? value.payment_method
                              : (nextPaymentMethods[0]?.key ?? ''),
                          items: value.items.map((item) => ({
                              ...item,
                              product_id: item.product_id || nextOptions.products[0]?.id || 0,
                          })),
                      }),
            }));
            setError('');
        } catch (requestError) {
            setError(message(requestError, t('Unable to complete the sale.')));
        } finally {
            setLoading(false);
        }
    }, [editId, historyFilters, historyPage, t, view]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    useEffect(() => {
        const durationReady =
            historyDraft.period === 'today' ||
            (historyDraft.period === 'range' && Boolean(historyDraft.date_from && historyDraft.date_to));

        if (view !== 'history' || !durationReady) {
            setHistoryOptions(emptyHistoryOptions);
            setHistoryTripsLoading(false);
            return;
        }

        let active = true;
        setHistoryTripsLoading(true);
        void saleApi
            .historyOptions({
                period: historyDraft.period,
                date_from: historyDraft.period === 'range' ? historyDraft.date_from : undefined,
                date_to: historyDraft.period === 'range' ? historyDraft.date_to : undefined,
            })
            .then((nextHistoryOptions) => {
                if (!active) return;
                setHistoryOptions({
                    customers: [],
                    products: [],
                    trips: nextHistoryOptions.trips ?? [],
                });
            })
            .catch((requestError) => {
                if (!active) return;
                setHistoryOptions(emptyHistoryOptions);
                setError(message(requestError, t('Unable to load trips for this duration.')));
            })
            .finally(() => {
                if (active) setHistoryTripsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [historyDraft.date_from, historyDraft.date_to, historyDraft.period, t, view]);
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
    const selectedRegionId = selectedCustomer?.region?.id ?? 0;
    const selectedRegionName = selectedCustomer?.region?.name ?? t('select customer');
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
    const lineNetTotal = useCallback((line: SaleInput['items'][number]) => {
        const product = options.products.find((item) => item.id === line.product_id);
        const gross = line.quantity * linePrice(line);
        return gross - Math.round(gross * (product?.discount_percentage ?? 0) / 100);
    }, [linePrice, options.products]);
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
        () => form.items.reduce((total, line) => total + lineNetTotal(line), 0),
        [form.items, lineNetTotal],
    );
    const payablePreview = Math.max(0, preview - form.promotion_amount);
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
        setPromotionExpanded(false);
        setCreationLocation(null);
        setLocationStatus('idle');
        setLocationMessage('');
        navigate('/sales/new-sale', { replace: true });
    };
    const validate = (forPosting: boolean) => {
        const next: Record<string, string[]> = {};
        if (!form.customer_id) next.customer_id = [t('Select a customer.')];
        if (!editing && !creationLocation)
            next.creation_location = [t('Capture the device location before creating this sale.')];
        const seen = new Set<number>();
        form.items.forEach((line, index) => {
            const product = options.products.find((item) => item.id === line.product_id);
            if (!product) next[`items.${index}.product_id`] = [t('Select an available product.')];
            else if (seen.has(line.product_id))
                next[`items.${index}.product_id`] = [t('Each product can appear only once.')];
            else seen.add(line.product_id);
            if (!Number.isInteger(line.quantity) || line.quantity < 1)
                next[`items.${index}.quantity`] = [t('Enter a whole quantity of at least 1.')];
            else if (
                forPosting &&
                product &&
                line.quantity * (lineUnit(line, product)?.conversion_factor ?? 1) > product.quantity
            )
                next[`items.${index}.quantity`] = [
                    t('Only {count} base units are currently available.', {
                        count: formatNumber(product.quantity),
                    }),
                ];
            if (!Number.isInteger(line.foc_quantity ?? 0) || (line.foc_quantity ?? 0) < 0)
                next[`items.${index}.foc_quantity`] = [t('Enter a whole FOC quantity of 0 or more.')];
            else if (
                (line.foc_quantity ?? 0) * (lineFocUnit(line, product)?.conversion_factor ?? 1) >
                (product?.foc_quantity ?? 0)
            )
                next[`items.${index}.foc_quantity`] = [
                    t('Only {count} FOC base units are available.', {
                        count: formatNumber(product?.foc_quantity ?? 0),
                    }),
                ];
            if (
                product &&
                selectedCustomer &&
                linePrice(line) === 0 &&
                !lineUnit(line)?.prices?.some((price) => price.region_id === selectedRegionId)
            )
                next[`items.${index}.product_unit_id`] = [t('This unit has no price for the customer region.')];
        });
        if (
            forPosting &&
            form.payment_type === 'credit' &&
            (!selectedCustomer?.credit_allowed || payablePreview > selectedCustomer.available_credit)
        )
            next.payment_type = [
                selectedCustomer?.credit_allowed
                    ? t('Only {amount} credit is currently available.', {
                          amount: money(selectedCustomer.available_credit),
                      })
                    : t('Credit sales are disabled for this customer.'),
            ];
        setFields(next);
        if (Object.keys(next).length) {
            setError(t('Review the highlighted sale details before continuing.'));
            return false;
        }
        return true;
    };
    const validateWizardStep = (step: SaleWizardStep) => {
        const next: Record<string, string[]> = {};
        if (step === 1 && !form.customer_id) next.customer_id = [t('Select a customer.')];
        if (step === 1 && !editing && !creationLocation)
            next.creation_location = [t('Capture the device location before continuing.')];
        if (step === 2) {
            if (form.items.length === 0) next.items = [t('Select at least one product.')];
            const selected = new Set<number>();
            form.items.forEach((line, index) => {
                if (!options.products.some((product) => product.id === line.product_id))
                    next[`items.${index}.product_id`] = [t('Select an available product.')];
                else if (selected.has(line.product_id))
                    next[`items.${index}.product_id`] = [t('Each product can appear only once.')];
                else selected.add(line.product_id);
            });
        }
        if (step === 3) {
            form.items.forEach((line, index) => {
                const product = options.products.find((item) => item.id === line.product_id);
                if (!Number.isInteger(line.quantity) || line.quantity < 1)
                    next[`items.${index}.quantity`] = [t('Enter a whole quantity of at least 1.')];
                else if (
                    product &&
                    line.quantity * (lineUnit(line, product)?.conversion_factor ?? 1) > product.quantity
                )
                    next[`items.${index}.quantity`] = [
                        t('Only {count} {units} are currently available.', {
                            count: formatNumber(product.quantity),
                            units: t((lineUnit(line, product)?.conversion_factor ?? 1) === 1 ? 'units' : 'base units'),
                        }),
                    ];
                if (!Number.isInteger(line.foc_quantity ?? 0) || (line.foc_quantity ?? 0) < 0)
                    next[`items.${index}.foc_quantity`] = [t('Enter a whole FOC quantity of 0 or more.')];
                else if (
                    product &&
                    (line.foc_quantity ?? 0) * (lineFocUnit(line, product)?.conversion_factor ?? 1) >
                        (product.foc_quantity ?? 0)
                )
                    next[`items.${index}.foc_quantity`] = [
                        t('Only {count} FOC base units are available.', {
                            count: formatNumber(product.foc_quantity ?? 0),
                        }),
                    ];
            });
        }
        setFields(next);
        if (Object.keys(next).length > 0) {
            setError(
                t('Complete the {step} step before continuing.', {
                    step: t(wizardSteps[step - 1].label).toLocaleLowerCase(),
                }),
            );
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
                setError(t('Current device location is required before this sale can be created.'));
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
                        t(
                            'Post {reference} for {amount}? {paid} paid and {foc} FOC base units will leave stock. {effect} will update immediately.',
                            {
                                reference: sale.reference,
                                amount: money(sale.total_amount),
                                paid: formatNumber(paidBaseTotal),
                                foc: formatNumber(focBaseTotal),
                                effect: t(
                                    sale.payment_type === 'credit'
                                        ? 'Customer credit'
                                        : options.payment_methods.find((method) => method.key === sale.payment_method)?.adds_to_cash_hold
                                          ? 'Cash hold'
                                          : 'Trip banking total',
                                ),
                            },
                        ),
                    )
                ) {
                    await load();
                    setEditing(sale);
                    return;
                }
                await saleApi.post(sale.id);
                showNotice(t('{reference} posted successfully.', { reference: sale.reference }));
                reset();
            } else {
                showNotice(t('{reference} saved as draft.', { reference: sale.reference }));
                setEditing(sale);
            }
            await load();
        } catch (requestError) {
            if (requestError instanceof SaleApiError) setFields(requestError.fields);
            setError(message(requestError, t('Unable to complete the sale.')));
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
        if (
            !window.confirm(
                t('Post {reference} for {amount}?', {
                    reference: sale.reference,
                    amount: money(sale.total_amount),
                }),
            )
        )
            return;
        setSaving(true);
        try {
            await saleApi.post(sale.id);
            await load();
            showNotice(t('{reference} posted successfully.', { reference: sale.reference }));
        } catch (requestError) {
            setError(message(requestError, t('Unable to complete the sale.')));
        } finally {
            setSaving(false);
        }
    };
    const deleteDraft = async (sale: Sale) => {
        setActionMenuSaleId(null);
        if (!window.confirm(t('Permanently delete draft {reference}? This action cannot be undone.', { reference: sale.reference }))) return;
        setSaving(true);
        setError('');
        try {
            await saleApi.deleteDraft(sale.id);
            if (editing?.id === sale.id) reset();
            await load();
            showNotice(t('{reference} deleted permanently.', { reference: sale.reference }));
        } catch (requestError) {
            setError(message(requestError, t('Unable to delete the draft sale.')));
        } finally {
            setSaving(false);
        }
    };
    const applyHistoryFilters = (event: FormEvent) => {
        event.preventDefault();
        const activeFilters = { ...historyDraft };
        delete activeFilters.customer_id;
        delete activeFilters.product_id;
        setHistoryPage(1);
        setHistoryDraft(activeFilters);
        setHistoryFilters(activeFilters);
        setHistoryFilterOpen(false);
    };
    const clearHistoryFilters = () => {
        setHistoryDraft({});
        setHistoryFilters({});
        setHistoryPage(1);
        setHistoryFilterOpen(false);
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
                    showNotice(t('{name} created as a cash-only customer.', { name: customer.name }));
                }}
                open={customerDialogOpen}
                regions={options.representative.regions ?? []}
            />
            <header className="sales-page-heading">
                <div>
                    <p>{t('Customer sales')}</p>
                    <h1>
                        {view === 'entry'
                            ? editing
                                ? t('Edit {reference}', { reference: editing.reference })
                                : t('New sale')
                            : t('Sales')}
                    </h1>
                </div>
                <StatusBadge tone={view === 'entry' ? 'info' : 'neutral'}>
                    {view === 'entry'
                        ? t('Server priced')
                        : t('{count} records', { count: formatNumber(salesMeta.total) })}
                </StatusBadge>
            </header>
            {view === 'history' ? (
                <section className="sales-summary-grid sales-report-summary" aria-label={t('Sales summary')}>
                    <article className="sales-summary-card is-primary">
                        <span>
                            <Icon name="sales" size={18} />
                        </span>
                        <small>{t('Gross sales')}</small>
                        <strong>{money(historySummary.gross_sales)}</strong>
                        <p>{t('Posted sales only')}</p>
                    </article>
                    <article className="sales-summary-card">
                        <span>
                            <Icon name="cash" size={18} />
                        </span>
                        <small>{t('Cash sales')}</small>
                        <strong>{money(historySummary.cash_sales)}</strong>
                        <p>{t('Posted sales only')}</p>
                    </article>
                    <article className="sales-summary-card">
                        <span><Icon name="customers" size={18} /></span>
                        <small>{t('Credit sales')}</small>
                        <strong>{money(historySummary.credit_sales)}</strong>
                        <p>{t('Posted sales only')}</p>
                    </article>
                    <article className="sales-summary-card">
                        <span><Icon name="box" size={18} /></span>
                        <small>{t('Units sold')}</small>
                        <strong>{formatNumber(historySummary.units_sold)}</strong>
                        <p>{t('Posted base quantities')}</p>
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
                    <button onClick={() => void load()}>{t('Retry')}</button>
                </div>
            ) : null}
            {view === 'entry' ? (
                <div className="sale-entry-grid">
                    <form className="sales-section sale-entry-form" onSubmit={submit}>
                        <header>
                            <div>
                                <p className="ui-eyebrow">{t('Sale details')}</p>
                                <h2>{t(editing ? 'Update draft' : 'Create customer sale')}</h2>
                            </div>
                            {editing ? (
                                <Button onClick={reset}>{t('New')}</Button>
                            ) : (
                                <Button
                                    icon="plus"
                                    onClick={() => {
                                        setCustomerPickerOpen(false);
                                        setCustomerDialogOpen(true);
                                    }}
                                    tone="ghost"
                                >
                                    {t('New customer')}
                                </Button>
                            )}
                        </header>
                        {loading ? (
                            <div className="ui-loading">
                                <span />
                                {t('Loading sale options…')}
                            </div>
                        ) : options.products.length === 0 ? (
                            <EmptyState
                                description={t('Received representative stock is required before creating a sale.')}
                                title={t('Sale entry is not ready')}
                            />
                        ) : (
                            <>
                                <nav aria-label={t('Sale progress')} className="sale-wizard-steps">
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
                                                    <strong>{t(step.label)}</strong>
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
                                            <p>{t('Step {current} of {total}', { current: wizardStep, total: 4 })}</p>
                                            <h3 id={`sale-step-${wizardStep}-title`}>
                                                {t(wizardSteps[wizardStep - 1].label)}
                                            </h3>
                                        </div>
                                        <small>
                                            {wizardStep === 1
                                                ? t('Add the customer and payment details.')
                                                : wizardStep === 2
                                                  ? t('Choose one or more products for this sale.')
                                                  : wizardStep === 3
                                                    ? t('Set the required quantity for every selected product.')
                                                    : t('Confirm the sale details before saving or posting.')}
                                        </small>
                                    </header>
                                    {wizardStep === 1 ? (
                                        <div className="sale-header-fields">
                                            <div className="ui-field sale-customer-picker" ref={customerPickerRef}>
                                                <label htmlFor="sale-customer-search">{t('Customer')}</label>
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
                                                        placeholder={t('Search by customer name or code')}
                                                        role="combobox"
                                                        value={
                                                            !customerPickerOpen && selectedCustomer
                                                                ? `${selectedCustomer.code} · ${selectedCustomer.name}`
                                                                : customerQuery
                                                        }
                                                    />
                                                    <button
                                                        aria-label={t('Toggle customer options')}
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
                                                        aria-label={t('Customer options')}
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
                                                                                : t('Cash only')}
                                                                        </strong>
                                                                        <small>
                                                                            {customer.credit_allowed
                                                                                ? t('credit available')
                                                                                : t('credit disabled')}
                                                                        </small>
                                                                    </span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <p>
                                                                {t('No customers match “{query}”.', {
                                                                    query: customerQuery,
                                                                })}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : null}
                                                {fields.customer_id?.[0] ? (
                                                    <small className="ui-field__error">{fields.customer_id[0]}</small>
                                                ) : null}
                                            </div>
                                            <fieldset className="sale-payment-picker">
                                                <legend>{t('Payment type')}</legend>
                                                <div>
                                                    <label
                                                        className={form.payment_type === 'cash' ? 'is-selected' : ''}
                                                    >
                                                        <input
                                                            aria-label={t('Paid now')}
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
                                                            <strong>{t('Paid now')}</strong>
                                                            <small>{t('Cash or banking')}</small>
                                                        </span>
                                                    </label>
                                                    <label
                                                        className={form.payment_type === 'credit' ? 'is-selected' : ''}
                                                    >
                                                        <input
                                                            aria-label={t('Credit')}
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
                                                            <strong>{t('Credit')}</strong>
                                                            <small>{t('Use available credit')}</small>
                                                        </span>
                                                    </label>
                                                </div>
                                                {fields.payment_type?.[0] ? (
                                                    <small className="ui-field__error">{fields.payment_type[0]}</small>
                                                ) : null}
                                            </fieldset>
                                            {form.payment_type === 'cash' ? (
                                                <fieldset className="sale-payment-picker sale-method-picker">
                                                    <legend>{t('Payment method')}</legend>
                                                    <div>
                                                        {options.payment_methods.map((method) => (
                                                            <label className={form.payment_method === method.key ? 'is-selected' : ''} key={method.key}>
                                                                <input
                                                                    checked={form.payment_method === method.key}
                                                                    name="payment_method"
                                                                    onChange={() => setForm((value) => ({ ...value, payment_method: method.key }))}
                                                                    type="radio"
                                                                    value={method.key}
                                                                />
                                                                <Icon name={method.adds_to_cash_hold ? 'cash' : 'building'} size={17} />
                                                                <span>
                                                                    <strong>{method.name}</strong>
                                                                    <small>{t(method.adds_to_cash_hold ? 'Adds to your cash hold' : 'Paid directly; not held as cash')}</small>
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {fields.payment_method?.[0] ? <small className="ui-field__error">{fields.payment_method[0]}</small> : null}
                                                </fieldset>
                                            ) : null}
                                            {selectedCustomer ? (
                                                <section
                                                    aria-label={t('Customer credit status')}
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
                                                            aria-label={t('Credit available: {value}', {
                                                                value: t(
                                                                    selectedCustomer.credit_allowed ? 'Yes' : 'No',
                                                                ),
                                                            })}
                                                            className={`sale-credit-status__indicator ${selectedCustomer.credit_allowed ? 'is-yes' : 'is-no'}`}
                                                            role="img"
                                                            title={t('Credit available: {value}', {
                                                                value: t(
                                                                    selectedCustomer.credit_allowed ? 'Yes' : 'No',
                                                                ),
                                                            })}
                                                        />
                                                    </div>
                                                    {selectedCustomer.credit_allowed ? (
                                                        <dl>
                                                            <div>
                                                                <dt>{t('Available')}</dt>
                                                                <dd>{money(selectedCustomer.available_credit)}</dd>
                                                            </div>
                                                            <div>
                                                                <dt>{t('Outstanding')}</dt>
                                                                <dd>{money(selectedCustomer.outstanding_amount)}</dd>
                                                            </div>
                                                            <div>
                                                                <dt>{t('Credit limit')}</dt>
                                                                <dd>{money(selectedCustomer.credit_limit)}</dd>
                                                            </div>
                                                        </dl>
                                                    ) : (
                                                        <div className="sale-credit-status__notice" role="status">
                                                            <Icon name="warning" size={16} />
                                                            <span>
                                                                <strong>{t('Credit not allowed')}</strong>
                                                                <small>
                                                                    {t(
                                                                        'This customer is configured for cash payments only.',
                                                                    )}
                                                                </small>
                                                            </span>
                                                        </div>
                                                    )}
                                                </section>
                                            ) : (
                                                <div className="sale-credit-status sale-credit-status--empty">
                                                    <Icon name="search" size={17} />
                                                    <span>
                                                        <strong>{t('Select a customer')}</strong>
                                                        <small>{t('Credit availability will appear here.')}</small>
                                                    </span>
                                                </div>
                                            )}
                                            <label className="ui-field sale-notes">
                                                <span>{t('Notes')}</span>
                                                <input
                                                    onChange={(event) =>
                                                        setForm((value) => ({
                                                            ...value,
                                                            notes: event.target.value,
                                                        }))
                                                    }
                                                    placeholder={t('Optional delivery or invoice note')}
                                                    value={form.notes}
                                                />
                                            </label>
                                            <section
                                                aria-label={t('Sale creation location')}
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
                                                            ? t('Original sale location preserved')
                                                            : locationStatus === 'ready'
                                                              ? t('Device location captured')
                                                              : locationStatus === 'locating'
                                                                ? t('Getting current location')
                                                                : t('Device location required')}
                                                    </strong>
                                                    <small>
                                                        {editing
                                                            ? t(
                                                                  'Editing this draft will not replace where it was created.',
                                                              )
                                                            : locationMessage ||
                                                              t(
                                                                  'Select Allow location so Chrome can ask for permission. The office will receive this point with the sale record.',
                                                              )}
                                                    </small>
                                                </span>
                                                {!editing && locationStatus !== 'ready' ? (
                                                    <Button
                                                        disabled={locationStatus === 'locating'}
                                                        onClick={() => void captureLocation()}
                                                    >
                                                        {locationStatus === 'locating'
                                                            ? t('Locating…')
                                                            : locationStatus === 'error'
                                                              ? t('Retry location')
                                                              : t('Allow location')}
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
                                        <div className="sale-product-selector" role="group" aria-label={t('Products')}>
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
                                                            aria-label={t('Select {name}', { name: product.name })}
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
                                                                <small>{t('paid')}</small>
                                                            </span>
                                                            <span>
                                                                <strong>{product.foc_quantity ?? 0}</strong>
                                                                <small>{t('FOC')}</small>
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
                                                            <small>
                                                                {product.discount_percentage > 0 ? t('{discount}% discount · {region} price', { discount: product.discount_percentage, region: selectedRegionName }) : t('{region} price', { region: selectedRegionName })}
                                                            </small>
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
                                                                {t('{paid} paid · {foc} FOC base available', {
                                                                    paid: formatNumber(product.quantity),
                                                                    foc: formatNumber(product.foc_quantity ?? 0),
                                                                })}
                                                            </small>
                                                        </div>
                                                        <div className="sale-quantity-list__controls sale-quantity-list__controls--paid">
                                                            <label className="ui-field">
                                                                <span>{t('Selling unit')}</span>
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
                                                                <span>{t('Paid quantity')}</span>
                                                                <input
                                                                    aria-label={t('Quantity for {name}', {
                                                                        name: product.name,
                                                                    })}
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
                                                                <span>{t('FOC unit')}</span>
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
                                                                <span>{t('FOC quantity')}</span>
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
                                                        <dt>{t('Customer')}</dt>
                                                        <dd>{selectedCustomer?.name ?? t('—')}</dd>
                                                    </div>
                                                    <div>
                                                        <dt>{t('Payment')}</dt>
                                                        <dd>
                                                            {t(form.payment_type)}
                                                            {form.payment_type === 'cash' ? ` · ${options.payment_methods.find((method) => method.key === form.payment_method)?.name ?? form.payment_method}` : ''}
                                                        </dd>
                                                    </div>
                                                    <div>
                                                        <dt>{t('Notes')}</dt>
                                                        <dd>{form.notes || t('No notes')}</dd>
                                                    </div>
                                                </dl>
                                                <Button onClick={() => setWizardStep(1)} tone="ghost">
                                                    {t('Edit information')}
                                                </Button>
                                            </div>
                                            <div className="sale-review__items">
                                                {form.items.map((line) => {
                                                    const product = options.products.find(
                                                        (item) => item.id === line.product_id,
                                                    );
                                                    if (!product) return null;
                                                    const gross = line.quantity * linePrice(line);
                                                    const discount = gross - lineNetTotal(line);
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
                                                                {product.discount_percentage > 0 ? (
                                                                    <span className="sale-review__discount">
                                                                        {t('{discount}% discount', { discount: product.discount_percentage })} · {t('Save {amount}', { amount: money(discount) })}
                                                                        <small>{t('Gross {amount}', { amount: money(gross) })}</small>
                                                                    </span>
                                                                ) : (
                                                                    <span className="sale-review__discount sale-review__discount--none">{t('No discount')}</span>
                                                                )}
                                                                <small>
                                                                    {t('FOC')}: {formatNumber(line.foc_quantity ?? 0)}{' '}
                                                                    {lineFocUnit(line, product)?.name} ·{' '}
                                                                    {(line.foc_quantity ?? 0) *
                                                                        (lineFocUnit(line, product)
                                                                            ?.conversion_factor ?? 1)}{' '}
                                                                    {t('base')}
                                                                </small>
                                                            </span>
                                                            <strong>{money(lineNetTotal(line))}</strong>
                                                        </article>
                                                    );
                                                })}
                                                <section className={`sale-review__promotion ${promotionExpanded ? 'is-expanded' : ''}`}>
                                                    <button aria-expanded={promotionExpanded} className="sale-review__promotion-toggle" onClick={() => setPromotionExpanded((value) => !value)} type="button">
                                                        <span><strong>{t('Promotion cashback')}</strong><small>{form.promotion_amount > 0 ? `${form.promotion_title} · -${money(form.promotion_amount)}` : t('No promotion applied')}</small></span>
                                                        <span><small>{t('Maximum {amount}', { amount: money(preview) })}</small><Icon name="chevronDown" size={16} /></span>
                                                    </button>
                                                    {promotionExpanded ? <div className="sale-review__promotion-fields">
                                                        <label className="ui-field"><span>{t('Promotion title')}</span><input maxLength={150} onChange={(event) => setForm((value) => ({ ...value, promotion_title: event.target.value }))} placeholder={t('Summer cashback')} value={form.promotion_title} />{fields.promotion_title?.[0] ? <small className="ui-field__error">{fields.promotion_title[0]}</small> : null}</label>
                                                        <label className="ui-field"><span>{t('Cashback amount')}</span><input inputMode="numeric" max={preview} min={0} onChange={(event) => setForm((value) => ({ ...value, promotion_amount: editableNumber(event.target.value.replace(/\D/g, '')) }))} pattern="[0-9]*" type="text" value={form.promotion_amount} />{fields.promotion_amount?.[0] ? <small className="ui-field__error">{fields.promotion_amount[0]}</small> : null}</label>
                                                    </div> : null}
                                                </section>
                                                <div className="sale-review__totals">
                                                    <span><small>{t('Merchandise subtotal')}</small><strong>{money(preview)}</strong></span>
                                                    <span className={form.promotion_amount > 0 ? 'is-discount' : ''}><small>{form.promotion_title || t('Promotion cashback')}</small><strong>-{money(form.promotion_amount)}</strong></span>
                                                    <span className="is-total"><small>{t('Payable total')}</small><strong>{money(payablePreview)}</strong></span>
                                                </div>
                                                <div
                                                    className="sale-review__stock-summary"
                                                    aria-label={t('Stock movement summary')}
                                                    role="region"
                                                >
                                                    <span>
                                                        <small>{t('Paid base units')}</small>
                                                        <strong>{formatNumber(paidBaseTotal)}</strong>
                                                    </span>
                                                    <span>
                                                        <small>{t('FOC base units')}</small>
                                                        <strong>{formatNumber(focBaseTotal)}</strong>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}
                                </section>
                                <footer className="sale-form-actions">
                                    {wizardStep > 1 ? <Button onClick={goBack}>{t('Back')}</Button> : <span />}
                                    <div>
                                        {wizardStep < 4 ? (
                                            <Button onClick={continueWizard} tone="primary">
                                                {wizardStep === 1
                                                    ? t('Continue to products')
                                                    : wizardStep === 2
                                                      ? t('Continue to quantity')
                                                      : t('Review sale')}
                                            </Button>
                                        ) : (
                                            <>
                                                <Button disabled={saving} requiresOnline type="submit">
                                                    {saving ? t('Saving…') : t('Save draft')}
                                                </Button>
                                                <Button
                                                    disabled={saving}
                                                    onClick={() => void save(true)}
                                                    requiresOnline
                                                    tone="primary"
                                                >
                                                    {saving ? t('Posting…') : t('Post sale')}
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
                            <p className="ui-eyebrow">{t('Own transactions')}</p>
                            <h2>{t('Sales activity')}</h2>
                        </div>
                        <Button icon="plus" onClick={() => navigate('/sales/new-sale')} tone="primary">
                            {t('New sale')}
                        </Button>
                    </header>
                    <form className="sales-history-filter-bar" onSubmit={applyHistoryFilters} role="search">
                        <label className="ui-field">
                            <span>{t('Search sales')}</span>
                            <input onChange={(event) => setHistoryDraft({ ...historyDraft, search: event.target.value || undefined })} placeholder={t('Reference, customer name, or code')} type="search" value={historyDraft.search ?? ''} />
                        </label>
                        <label className="ui-field">
                            <span>{t('Status')}</span>
                            <span className="sales-history-status-select">
                                <select
                                    aria-label={t('Status')}
                                    onChange={(event) => setHistoryDraft({ ...historyDraft, status: event.target.value || undefined })}
                                    value={historyDraft.status ?? ''}
                                >
                                    <option value="">{t('All statuses')}</option>
                                    <option value="draft">{t('Draft')}</option>
                                    <option value="posted">{t('Posted')}</option>
                                    <option value="voided">{t('Voided')}</option>
                                </select>
                                <Icon name="chevronDown" size={15} />
                            </span>
                        </label>
                        <Button icon="adjustments" onClick={() => setHistoryFilterOpen(true)} type="button">{t('More filters')}</Button>
                        <Button icon="search" tone="primary" type="submit">{t('Apply')}</Button>
                    </form>
                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            {t('Loading sales…')}
                        </div>
                    ) : sales.length === 0 ? (
                        <EmptyState
                            description={t('Saved drafts and posted sales will appear here.')}
                            title={t('No sales yet')}
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
                                            {t('{count} units · {payment}', {
                                                count: formatNumber(sale.total_quantity),
                                                payment: t(sale.payment_type),
                                            })}
                                        </small>
                                    </div>
                                    <div className="sales-history__end">
                                        <StatusBadge tone={tone(sale.status)}>{t(sale.status)}</StatusBadge>
                                        {sale.status !== 'draft' ? (
                                            <>
                                                <InvoicePrintButton
                                                    iconOnly
                                                    onBlocked={() => setError(t('Allow pop-ups to print the invoice.'))}
                                                    sale={sale}
                                                />
                                                <Link
                                                    aria-label={t('View {reference}', {
                                                        reference: sale.reference,
                                                    })}
                                                    className="ui-icon-button ui-icon-button--secondary sales-history__detail-link"
                                                    title={t('View {reference}', { reference: sale.reference })}
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
                                                    label={t('Actions for {reference}', {
                                                        reference: sale.reference,
                                                    })}
                                                    onClick={() =>
                                                        setActionMenuSaleId((current) =>
                                                            current === sale.id ? null : sale.id,
                                                        )
                                                    }
                                                />
                                                {actionMenuSaleId === sale.id ? (
                                                    <div
                                                        aria-label={t('Actions for {reference}', {
                                                            reference: sale.reference,
                                                        })}
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
                                                            <span>{t('View')}</span>
                                                        </Link>
                                                        <Button
                                                            className="sales-history__menu-item"
                                                            icon="edit"
                                                            onClick={() => edit(sale)}
                                                            role="menuitem"
                                                            tone="ghost"
                                                        >
                                                            {t('Edit')}
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
                                                            {t('Post')}
                                                        </Button>
                                                        <Button
                                                            className="sales-history__menu-item"
                                                            disabled={saving}
                                                            icon="x"
                                                            onClick={() => void deleteDraft(sale)}
                                                            requiresOnline
                                                            role="menuitem"
                                                            tone="danger"
                                                        >
                                                            {t('Delete permanently')}
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
                        label={t('Sales')}
                        loading={loading}
                        meta={salesMeta}
                        onPageChange={(page) => {
                            setLoading(true);
                            setHistoryPage(page);
                        }}
                    />
                </section>
            )}
            <Drawer
                description={t('Choose a duration first, then select from the trips found in that duration.')}
                footer={<><Button onClick={clearHistoryFilters}>{t('Clear')}</Button><Button form="sales-history-filters" icon="search" tone="primary" type="submit">{t('Apply filters')}</Button></>}
                onClose={() => setHistoryFilterOpen(false)}
                open={view === 'history' && historyFilterOpen}
                title={t('Filter sales')}
            >
                <form className="sales-report-filter-form sales-report-drawer-form" id="sales-history-filters" onSubmit={applyHistoryFilters}>
                    <label className="ui-field">
                        <span>{t('Duration')}</span>
                        <select
                            onChange={(event) => setHistoryDraft((current) => ({
                                ...current,
                                period: event.target.value || undefined,
                                date_from: undefined,
                                date_to: undefined,
                                trip_id: undefined,
                            }))}
                            required
                            value={historyDraft.period ?? ''}
                        >
                            <option value="" disabled>{t('Choose duration')}</option>
                            <option value="today">{t('Today')}</option>
                            <option value="range">{t('Date range')}</option>
                        </select>
                    </label>
                    {historyDraft.period === 'range' ? (
                        <div className="sales-history-duration-range">
                            <label className="ui-field">
                                <span>{t('From')}</span>
                                <input
                                    max={historyDraft.date_to}
                                    onChange={(event) => setHistoryDraft((current) => ({ ...current, date_from: event.target.value || undefined, trip_id: undefined }))}
                                    required
                                    type="date"
                                    value={historyDraft.date_from ?? ''}
                                />
                            </label>
                            <label className="ui-field">
                                <span>{t('To')}</span>
                                <input
                                    min={historyDraft.date_from}
                                    onChange={(event) => setHistoryDraft((current) => ({ ...current, date_to: event.target.value || undefined, trip_id: undefined }))}
                                    required
                                    type="date"
                                    value={historyDraft.date_to ?? ''}
                                />
                            </label>
                        </div>
                    ) : null}
                    <label className="ui-field">
                        <span>{t('Trip')}</span>
                        <select
                            disabled={
                                historyTripsLoading ||
                                (historyDraft.period !== 'today' && !(historyDraft.period === 'range' && historyDraft.date_from && historyDraft.date_to))
                            }
                            onChange={(event) => setHistoryDraft({ ...historyDraft, trip_id: Number(event.target.value) || undefined })}
                            value={historyDraft.trip_id ?? 0}
                        >
                            <option value={0}>
                                {historyTripsLoading
                                    ? t('Loading trips…')
                                    : !historyDraft.period || (historyDraft.period === 'range' && (!historyDraft.date_from || !historyDraft.date_to))
                                      ? t('Choose duration first')
                                      : historyOptions.trips.length === 0
                                        ? t('No trips in this duration')
                                        : t('All trips in this duration')}
                            </option>
                            {historyOptions.trips.map((row) => <option key={row.id} value={row.id}>{row.reference} · {row.title}</option>)}
                        </select>
                        <small className="sales-history-filter-hint">{t('The trip list updates automatically from the selected duration.')}</small>
                    </label>
                    <label className="ui-field"><span>{t('Payment')}</span><select onChange={(event) => setHistoryDraft({ ...historyDraft, payment_type: event.target.value || undefined })} value={historyDraft.payment_type ?? ''}><option value="">{t('Cash & credit')}</option><option value="cash">{t('Cash')}</option><option value="credit">{t('Credit')}</option></select></label>
                </form>
            </Drawer>
        </div>
    );
}

const emptyCustomerForm: SalesCustomerInput = {
    address: '',
    customer_type: 'Shop',
    name: '',
    notes: '',
    phone: '',
    region_id: 0,
    township: '',
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
    regions: Array<{ id: number; name: string }>;
}) {
    const { t } = useLocale();
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
        <Dialog
            description={t(
                'The customer is assigned to your warehouse. Credit is disabled and the credit limit starts at 0.',
            )}
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        {t('Cancel')}
                    </Button>
                    <Button
                        disabled={saving}
                        form="sales-new-customer-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? t('Creating…') : t('Create customer')}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={t('New customer')}
        >
            <form className="management-form" id="sales-new-customer-form" onSubmit={submitCustomer}>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>{t('Customer name')}</span>
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
                        <span>{t('Customer type')}</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('customer_type', event.target.value)}
                            value={form.customer_type}
                        />
                        {fieldError('customer_type')}
                    </label>
                    <label className="ui-field">
                        <span>{t('Phone')}</span>
                        <input
                            maxLength={50}
                            onChange={(event) => change('phone', event.target.value)}
                            value={form.phone}
                        />
                        {fieldError('phone')}
                    </label>
                    <label className="ui-field">
                        <span>{t('Region')}</span>
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
                    </label>
                    <label className="ui-field">
                        <span>{t('Township')}</span>
                        <input maxLength={100} onChange={(event) => change('township', event.target.value)} value={form.township} />
                        {fieldError('township')}
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Address')}</span>
                        <input
                            maxLength={500}
                            onChange={(event) => change('address', event.target.value)}
                            value={form.address}
                        />
                        {fieldError('address')}
                    </label>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Notes')}</span>
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
