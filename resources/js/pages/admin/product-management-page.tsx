import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    ProductApiError,
    productApi,
    type Product,
    type ProductFilters,
    type ProductInput,
    type ProductOptions,
    type ProductSummary,
} from '../../services/products';
import { Icon } from '../../ui/icons';
import { editableNumber } from '../../ui/form-values';
import { Button, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptyOptions: ProductOptions = { categories: [], units: [], regions: [] };
const emptySummary: ProductSummary = { active: 0, categories: 0, inactive: 0, total: 0 };

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

const priceFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function priceInputValue(value: number) {
    return priceFormatter.format(Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);
}

function priceFromInput(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 15);
    return digits ? Number(digits) : 0;
}

export function ProductManagementPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useSession();
    const { formatDateTime, formatNumber, t } = useLocale();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('product.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('product.edit'));
    const [products, setProducts] = useState<Product[]>([]);
    const [options, setOptions] = useState<ProductOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [draftFilters, setDraftFilters] = useState({
        category: '',
        search: '',
        status: '',
        unit: '',
    });
    const [filters, setFilters] = useState<ProductFilters>({
        page: 1,
    });

    const loadProducts = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([productApi.list(filters), productApi.options()]);
            setProducts(response.data);
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
        void Promise.all([productApi.list(filters), productApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setProducts(response.data);
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

    const dateTime = (value: string | null) => (value ? formatDateTime(value) : t('Not available'));
    const money = (value: number) => `${formatNumber(value)} MMK`;

    return (
        <div className="admin-page product-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Master data')}</p>
                    <h1>{t('Products')}</h1>
                    <p>{t('Maintain the sellable catalogue, units, barcodes, and default MMK prices.')}</p>
                </div>
                {canCreate ? (
                    <Button icon="plus" onClick={() => navigate('/admin/products/new')} tone="primary">
                        {t('New product')}
                    </Button>
                ) : null}
            </header>

            {(location.state as { notice?: string } | null)?.notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="check" size={15} />
                    {(location.state as { notice: string }).notice}
                </div>
            ) : null}

            <div className="metric-grid access-metrics">
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="box"
                    label={t('Products')}
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
                    icon="adjustments"
                    label={t('Inactive')}
                    value={formatNumber(summary.inactive)}
                />
                <MetricCard
                    hint={t('Current filtered result')}
                    icon="reports"
                    label={t('Categories')}
                    value={formatNumber(summary.categories)}
                />
            </div>

            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadProducts()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}

            <Panel eyebrow={t('Catalogue')} title={t('Product directory')}>
                <form
                    className="filter-toolbar product-filters"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setLoading(true);
                        setFilters({
                            category: draftFilters.category,
                            page: 1,
                            search: draftFilters.search,
                            status: draftFilters.status,
                            unit: draftFilters.unit,
                        });
                    }}
                >
                    <label className="filter-search">
                        <span className="sr-only">{t('Search products')}</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder={t('Search SKU, name, or barcode')}
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
                        <span className="sr-only">{t('Filter by category')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    category: event.target.value,
                                }))
                            }
                            value={draftFilters.category}
                        >
                            <option value="">{t('All categories')}</option>
                            {options.categories.map((category) => (
                                <option key={category}>{category}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">{t('Filter by unit')}</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    unit: event.target.value,
                                }))
                            }
                            value={draftFilters.unit}
                        >
                            <option value="">{t('All units')}</option>
                            {options.units.map((unit) => (
                                <option key={unit}>{unit}</option>
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
                        {t('Loading products…')}
                    </div>
                ) : products.length === 0 ? (
                    <EmptyState
                        description={t('Change the filters or create the first catalogue item.')}
                        title={t('No products found')}
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table product-table">
                            <thead>
                                <tr>
                                    <th>{t('Product')}</th>
                                    <th>{t('Category / unit')}</th>
                                    <th>{t('Barcode')}</th>
                                    <th className="is-numeric">{t('Default price')}</th>
                                    <th>{t('Status')}</th>
                                    <th>{t('Updated')}</th>
                                    {canEdit ? <th className="ui-table__actions">{t('Actions')}</th> : null}
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product.id}>
                                        <td>
                                            <strong>{product.name}</strong>
                                            <small>{product.sku}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {product.category || t('Uncategorized')}
                                            </span>
                                            <small>{t('Per {unit}', { unit: product.unit })}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">
                                                {product.barcode || t('Not specified')}
                                            </span>
                                            <small>{product.description || t('No description')}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{money(product.selling_price)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={product.is_active ? 'success' : 'danger'}>
                                                {t(product.is_active ? 'Active' : 'Inactive')}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(product.updated_at)}</span>
                                            <small>{t('Created {date}', { date: dateTime(product.created_at) })}</small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={t('Edit {name}', { name: product.name })}
                                                    onClick={() => navigate(`/admin/products/${product.id}/edit`)}
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
                        {t('{from}–{to} of {total} products', {
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
                        {t('Page {current} of {total}', {
                            current: formatNumber(meta.current_page),
                            total: formatNumber(meta.last_page),
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
        </div>
    );
}

export function ProductFormPage() {
    const { user } = useSession();
    const { t } = useLocale();
    const navigate = useNavigate();
    const { productId } = useParams();
    const id = productId ? Number(productId) : null;
    const invalidLink = id !== null && (!Number.isInteger(id) || id < 1);
    const [options, setOptions] = useState<ProductOptions>(emptyOptions);
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const isSuperAdmin = Boolean(user?.roles.includes('super-admin'));
    const canManage = Boolean(
        isSuperAdmin || user?.permissions.includes(id === null ? 'product.create' : 'product.edit'),
    );

    useEffect(() => {
        let active = true;
        if (invalidLink) {
            return () => {
                active = false;
            };
        }
        void Promise.all([productApi.options(), id === null ? Promise.resolve(null) : productApi.get(id)])
            .then(([availableOptions, response]) => {
                if (!active) return;
                setOptions(availableOptions);
                setProduct(response?.data ?? null);
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
    }, [id, invalidLink, t]);

    const pageError = invalidLink
        ? t('This product link is invalid.')
        : !canManage
          ? t('You do not have permission to {action} products.', {
                action: t(id === null ? 'create' : 'edit'),
            })
          : error;

    return (
        <div className="admin-page product-form-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Product catalogue')}</p>
                    <h1>{product ? t('Edit {name}', { name: product.sku }) : t('Create product')}</h1>
                    <p>
                        {t('Define product details, selling units, conversions, and prices for every active Region.')}
                    </p>
                </div>
                <Button icon="chevronLeft" onClick={() => navigate('/admin/products')}>
                    {t('Back to products')}
                </Button>
            </header>
            {pageError ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {pageError}
                    <Link to="/admin/products">{t('Return to products')}</Link>
                </div>
            ) : loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    {t('Loading product form…')}
                </div>
            ) : (
                <ProductForm
                    onCancel={() => navigate('/admin/products')}
                    onSaved={(message) => navigate('/admin/products', { state: { notice: message } })}
                    options={options}
                    product={product}
                />
            )}
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function ProductForm({
    onCancel,
    onSaved,
    product,
    options,
}: {
    onCancel: () => void;
    onSaved: (message: string) => void;
    product: Product | null;
    options: ProductOptions;
}) {
    const { formatNumber, t } = useLocale();
    const [form, setForm] = useState<ProductInput>({
        barcode: '',
        category: '',
        description: '',
        discount_percentage: 0,
        is_active: true,
        name: '',
        selling_price: 0,
        sku: '',
        unit: 'piece',
        units: [],
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const sortedRegions = useMemo(
        () =>
            [...(options.regions ?? [])].sort(
                (left, right) =>
                    left.warehouse.name.localeCompare(right.warehouse.name) ||
                    left.warehouse.code.localeCompare(right.warehouse.code) ||
                    left.name.localeCompare(right.name) ||
                    left.id - right.id,
            ),
        [options.regions],
    );
    const warehouseRegionGroups = useMemo(() => {
        const groups = new Map<number, { code: string; name: string; regions: typeof sortedRegions }>();
        sortedRegions.forEach((region) => {
            const group = groups.get(region.warehouse.id);
            if (group) group.regions.push(region);
            else
                groups.set(region.warehouse.id, {
                    code: region.warehouse.code,
                    name: region.warehouse.name,
                    regions: [region],
                });
        });
        return Array.from(groups.values());
    }, [sortedRegions]);

    useEffect(() => {
        setErrors({});
        const units = product?.units?.length
            ? product.units.map((unit) => ({
                  ...unit,
                  barcode: unit.barcode ?? '',
                  prices: sortedRegions.map(
                      (region) =>
                          unit.prices.find((price) => price.region_id === region.id) ?? {
                              region_id: region.id,
                              price: 0,
                          },
                  ),
              }))
            : [
                  {
                      name: 'piece',
                      conversion_factor: 1,
                      barcode: '',
                      is_base: true,
                      is_default_selling: true,
                      is_active: true,
                      prices: sortedRegions.map((region) => ({ region_id: region.id, price: 0 })),
                  },
              ];
        setForm({
            barcode: product?.barcode ?? '',
            category: product?.category ?? '',
            description: product?.description ?? '',
            discount_percentage: product?.discount_percentage ?? 0,
            is_active: product?.is_active ?? true,
            name: product?.name ?? '',
            selling_price: product?.selling_price ?? 0,
            sku: product?.sku ?? '',
            unit: product?.unit ?? 'piece',
            units,
        });
    }, [product, sortedRegions]);

    const change = (field: keyof ProductInput, value: boolean | number | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const updateUnit = (unitIndex: number, patch: Partial<ProductInput['units'][number]>) =>
        setForm((current) => ({
            ...current,
            units: current.units.map((unit, index) => (index === unitIndex ? { ...unit, ...patch } : unit)),
        }));
    const updateUnitPrice = (unitIndex: number, regionId: number, price: number) =>
        setForm((current) => ({
            ...current,
            units: current.units.map((unit, index) => {
                if (index !== unitIndex) return unit;
                const hasRegion = unit.prices.some((entry) => entry.region_id === regionId);
                return {
                    ...unit,
                    prices: hasRegion
                        ? unit.prices.map((entry) => (entry.region_id === regionId ? { ...entry, price } : entry))
                        : [...unit.prices, { region_id: regionId, price }],
                };
            }),
        }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            product?.is_active &&
            !form.is_active &&
            !window.confirm(
                t('Deactivate {name}? It will remain in history but cannot be used for new transactions.', {
                    name: product.name,
                }),
            )
        )
            return;
        setSaving(true);
        setErrors({});
        try {
            const defaultUnit = form.units.find((unit) => unit.is_default_selling) ?? form.units[0];
            const payload = {
                ...form,
                unit: defaultUnit?.name ?? 'piece',
                barcode: defaultUnit?.barcode ?? '',
                selling_price: defaultUnit?.prices[0]?.price ?? 0,
            };
            if (product) await productApi.update(product.id, payload);
            else await productApi.create(payload);
            onSaved(t(product ? 'Product updated.' : 'Product created.'));
        } catch (requestError) {
            if (requestError instanceof ProductApiError) setErrors(requestError.fields);
            setErrors((current) => ({
                ...current,
                form: [errorMessage(requestError, t('Unable to complete the request.'))],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="management-form product-form" id="product-management-form" onSubmit={submit}>
            <section className="product-form__intro">
                <div>
                    <p className="ui-eyebrow">{t('Product definition')}</p>
                    <h2>{t('Catalogue and pricing setup')}</h2>
                    <p>
                        {t(
                            'Define the smallest stock unit, default selling unit, conversion factors, and prices for every active Region.',
                        )}
                    </p>
                </div>
            </section>
            <div className="product-form__body">
                {errors.form?.[0] ? (
                    <div className="ui-form-error" role="alert">
                        {errors.form[0]}
                    </div>
                ) : null}
                <div className="form-grid">
                    <label className="ui-field">
                        <span>{t('SKU')}</span>
                        <input
                            autoFocus
                            maxLength={50}
                            onChange={(event) => change('sku', event.target.value.toUpperCase())}
                            placeholder="DW-1L"
                            required
                            value={form.sku}
                        />
                        <FieldError errors={errors} name="sku" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Product name')}</span>
                        <input
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Category')}</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('category', event.target.value)}
                            placeholder={t('Drinking Water')}
                            value={form.category}
                        />
                        <FieldError errors={errors} name="category" />
                    </label>
                    <label className="ui-field">
                        <span>{t('Legacy display unit')}</span>
                        <input
                            disabled
                            value={form.units.find((unit) => unit.is_default_selling)?.name ?? t('Not selected')}
                        />
                    </label>
                    <label className="ui-field">
                        <span>{t('Item discount (%)')}</span>
                        <input max={100} min={0} onChange={(event) => change('discount_percentage', Number(event.target.value))} step="0.01" type="number" value={form.discount_percentage} />
                        <small>{t('Applied to this product in every region during sales.')}</small>
                        <FieldError errors={errors} name="discount_percentage" />
                    </label>
                    <section className="product-unit-editor form-grid__wide">
                        <header>
                            <div>
                                <strong>{t('Units and regional prices')}</strong>
                                <small>
                                    {t(
                                        'Stock is stored in the base unit. Conversion factors express how many base units are in one selected unit. Regional prices are entered in MMK.',
                                    )}
                                </small>
                            </div>
                            <Button
                                icon="plus"
                                onClick={() =>
                                    setForm((value) => ({
                                        ...value,
                                        units: [
                                            ...value.units,
                                            {
                                                name: '',
                                                conversion_factor: 1,
                                                barcode: '',
                                                is_base: false,
                                                is_default_selling: false,
                                                is_active: true,
                                                prices: sortedRegions.map((region) => ({
                                                    region_id: region.id,
                                                    price: 0,
                                                })),
                                            },
                                        ],
                                    }))
                                }
                                tone="secondary"
                                type="button"
                            >
                                {t('Add unit')}
                            </Button>
                        </header>
                        <div className="ui-table-wrap product-unit-table-wrap">
                            <table
                                className="ui-table product-unit-table"
                                style={{ minWidth: `${560 + sortedRegions.length * 105}px` }}
                            >
                                <caption className="sr-only">
                                    {t('Product units and prices by warehouse Region')}
                                </caption>
                                <thead>
                                    <tr>
                                        <th rowSpan={sortedRegions.length ? 2 : 1} scope="col">
                                            {t('Unit name')}
                                        </th>
                                        <th rowSpan={sortedRegions.length ? 2 : 1} scope="col">
                                            {t('Base units')}
                                        </th>
                                        <th rowSpan={sortedRegions.length ? 2 : 1} scope="col">
                                            {t('Barcode')}
                                        </th>
                                        <th rowSpan={sortedRegions.length ? 2 : 1} scope="col">
                                            {t('Base unit')}
                                        </th>
                                        <th rowSpan={sortedRegions.length ? 2 : 1} scope="col">
                                            {t('Default selling')}
                                        </th>
                                        {warehouseRegionGroups.map((group) => (
                                            <th colSpan={group.regions.length} key={group.code} scope="colgroup">
                                                <strong>{group.name}</strong>
                                                <small>{group.code}</small>
                                            </th>
                                        ))}
                                        <th rowSpan={sortedRegions.length ? 2 : 1} scope="col">
                                            {t('Actions')}
                                        </th>
                                    </tr>
                                    {sortedRegions.length ? (
                                        <tr>
                                            {sortedRegions.map((region) => (
                                                <th data-region-id={region.id} key={region.id} scope="col">
                                                    {region.name}
                                                    <small>MMK</small>
                                                </th>
                                            ))}
                                        </tr>
                                    ) : null}
                                </thead>
                                <tbody>
                                    {form.units.map((unit, unitIndex) => {
                                        const unitLabel =
                                            unit.name || t('Unit {number}', { number: formatNumber(unitIndex + 1) });
                                        return (
                                            <tr key={unit.id ?? `new-${unitIndex}`}>
                                                <td>
                                                    <label>
                                                        <span className="sr-only">
                                                            {t('Unit name for row {number}', {
                                                                number: formatNumber(unitIndex + 1),
                                                            })}
                                                        </span>
                                                        <input
                                                            onChange={(event) =>
                                                                updateUnit(unitIndex, { name: event.target.value })
                                                            }
                                                            placeholder={t('bottle / box')}
                                                            required
                                                            value={unit.name}
                                                        />
                                                    </label>
                                                </td>
                                                <td>
                                                    <label>
                                                        <span className="sr-only">
                                                            {t('Base units in {unit}', { unit: unitLabel })}
                                                        </span>
                                                        <input
                                                            disabled={unit.is_base}
                                                            min={1}
                                                            onChange={(event) =>
                                                                updateUnit(unitIndex, {
                                                                    conversion_factor: editableNumber(
                                                                        event.target.value,
                                                                    ),
                                                                })
                                                            }
                                                            required
                                                            type="number"
                                                            value={unit.conversion_factor}
                                                        />
                                                    </label>
                                                </td>
                                                <td>
                                                    <label>
                                                        <span className="sr-only">
                                                            {t('Barcode for {unit}', { unit: unitLabel })}
                                                        </span>
                                                        <input
                                                            onChange={(event) =>
                                                                updateUnit(unitIndex, { barcode: event.target.value })
                                                            }
                                                            value={unit.barcode ?? ''}
                                                        />
                                                    </label>
                                                </td>
                                                <td className="product-unit-table__choice">
                                                    <label>
                                                        <input
                                                            aria-label={t('Use {unit} as base unit', {
                                                                unit: unitLabel,
                                                            })}
                                                            checked={unit.is_base}
                                                            name="base-unit"
                                                            onChange={() =>
                                                                setForm((value) => ({
                                                                    ...value,
                                                                    units: value.units.map((item, index) => ({
                                                                        ...item,
                                                                        is_base: index === unitIndex,
                                                                        conversion_factor:
                                                                            index === unitIndex
                                                                                ? 1
                                                                                : item.conversion_factor,
                                                                    })),
                                                                }))
                                                            }
                                                            type="radio"
                                                        />
                                                    </label>
                                                </td>
                                                <td className="product-unit-table__choice">
                                                    <label>
                                                        <input
                                                            aria-label={t('Use {unit} as default selling unit', {
                                                                unit: unitLabel,
                                                            })}
                                                            checked={unit.is_default_selling}
                                                            name="default-selling-unit"
                                                            onChange={() =>
                                                                setForm((value) => ({
                                                                    ...value,
                                                                    units: value.units.map((item, index) => ({
                                                                        ...item,
                                                                        is_default_selling: index === unitIndex,
                                                                    })),
                                                                }))
                                                            }
                                                            type="radio"
                                                        />
                                                    </label>
                                                </td>
                                                {sortedRegions.map((region) => (
                                                    <td className="is-numeric" key={region.id}>
                                                        <label className="product-price-input">
                                                            <span className="sr-only">
                                                                {t('{region} price for {unit} in MMK', {
                                                                    region: region.name,
                                                                    unit: unitLabel,
                                                                })}
                                                            </span>
                                                            <input
                                                                autoComplete="off"
                                                                inputMode="numeric"
                                                                onChange={(event) =>
                                                                    updateUnitPrice(
                                                                        unitIndex,
                                                                        region.id,
                                                                        priceFromInput(event.target.value),
                                                                    )
                                                                }
                                                                onFocus={(event) => event.currentTarget.select()}
                                                                pattern="[0-9,]*"
                                                                required
                                                                type="text"
                                                                value={priceInputValue(
                                                                    unit.prices.find(
                                                                        (price) => price.region_id === region.id,
                                                                    )?.price ?? 0,
                                                                )}
                                                            />
                                                        </label>
                                                    </td>
                                                ))}
                                                <td className="product-unit-table__actions">
                                                    {form.units.length > 1 &&
                                                    !unit.is_base &&
                                                    !unit.is_default_selling ? (
                                                        <Button
                                                            onClick={() =>
                                                                setForm((value) => ({
                                                                    ...value,
                                                                    units: value.units.filter(
                                                                        (_, index) => index !== unitIndex,
                                                                    ),
                                                                }))
                                                            }
                                                            tone="secondary"
                                                            type="button"
                                                        >
                                                            {t('Remove')}
                                                        </Button>
                                                    ) : (
                                                        <span aria-hidden="true">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <FieldError errors={errors} name="units" />
                    </section>
                    <label className="ui-field form-grid__wide">
                        <span>{t('Description')}</span>
                        <textarea
                            maxLength={2000}
                            onChange={(event) => change('description', event.target.value)}
                            rows={3}
                            value={form.description}
                        />
                        <FieldError errors={errors} name="description" />
                    </label>
                    <label className="ui-check form-grid__wide">
                        <input
                            checked={form.is_active}
                            onChange={(event) => change('is_active', event.target.checked)}
                            type="checkbox"
                        />
                        <span>
                            <strong>{t('Active product')}</strong>
                            <small>
                                {t('Inactive products remain in history but cannot be selected for new transactions.')}
                            </small>
                        </span>
                    </label>
                </div>
            </div>
            <footer className="product-form__actions">
                <Button disabled={saving} onClick={onCancel} type="button">
                    {t('Cancel')}
                </Button>
                <Button disabled={saving} requiresOnline tone="primary" type="submit">
                    {saving ? t('Saving…') : t('Save product')}
                </Button>
            </footer>
        </form>
    );
}
