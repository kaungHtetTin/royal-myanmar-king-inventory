import { useCallback, useEffect, useState, type FormEvent } from 'react';
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

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to complete the request.';
}

function dateTime(value: string | null) {
    if (!value) return 'Not available';
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
}

export function ProductManagementPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useSession();
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
            setError(errorMessage(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);

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
                if (active) setError(errorMessage(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [filters]);

    return (
        <div className="admin-page product-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Master data</p>
                    <h1>Products</h1>
                    <p>Maintain the sellable catalogue, units, barcodes, and default MMK prices.</p>
                </div>
                {canCreate ? (
                    <Button icon="plus" onClick={() => navigate('/admin/products/new')} tone="primary">
                        New product
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
                <MetricCard hint="Current filtered result" icon="box" label="Products" value={String(summary.total)} />
                <MetricCard
                    hint="Current filtered result"
                    icon="dashboard"
                    label="Active"
                    value={String(summary.active)}
                />
                <MetricCard
                    hint="Current filtered result"
                    icon="adjustments"
                    label="Inactive"
                    value={String(summary.inactive)}
                />
                <MetricCard
                    hint="Current filtered result"
                    icon="reports"
                    label="Categories"
                    value={String(summary.categories)}
                />
            </div>

            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void loadProducts()} type="button">
                        Retry
                    </button>
                </div>
            ) : null}

            <Panel eyebrow="Catalogue" title="Product directory">
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
                        <span className="sr-only">Search products</span>
                        <Icon name="search" size={15} />
                        <input
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder="Search SKU, name, or barcode"
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
                        <span className="sr-only">Filter by category</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    category: event.target.value,
                                }))
                            }
                            value={draftFilters.category}
                        >
                            <option value="">All categories</option>
                            {options.categories.map((category) => (
                                <option key={category}>{category}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span className="sr-only">Filter by unit</span>
                        <select
                            onChange={(event) =>
                                setDraftFilters((value) => ({
                                    ...value,
                                    unit: event.target.value,
                                }))
                            }
                            value={draftFilters.unit}
                        >
                            <option value="">All units</option>
                            {options.units.map((unit) => (
                                <option key={unit}>{unit}</option>
                            ))}
                        </select>
                    </label>
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        Loading products…
                    </div>
                ) : products.length === 0 ? (
                    <EmptyState
                        description="Change the filters or create the first catalogue item."
                        title="No products found"
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table product-table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Category / unit</th>
                                    <th>Barcode</th>
                                    <th className="is-numeric">Default price</th>
                                    <th>Status</th>
                                    <th>Updated</th>
                                    {canEdit ? <th className="ui-table__actions">Actions</th> : null}
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
                                            <span className="table-primary">{product.category || 'Uncategorized'}</span>
                                            <small>Per {product.unit}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{product.barcode || 'Not specified'}</span>
                                            <small>{product.description || 'No description'}</small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{money(product.selling_price)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={product.is_active ? 'success' : 'danger'}>
                                                {product.is_active ? 'Active' : 'Inactive'}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <span className="table-primary">{dateTime(product.updated_at)}</span>
                                            <small>Created {dateTime(product.created_at)}</small>
                                        </td>
                                        {canEdit ? (
                                            <td className="ui-table__actions">
                                                <IconButton
                                                    icon="settings"
                                                    label={`Edit ${product.name}`}
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
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total} products
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
        </div>
    );
}

export function ProductFormPage() {
    const { user } = useSession();
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
                if (active) setError(errorMessage(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [id, invalidLink]);

    const pageError = invalidLink
        ? 'This product link is invalid.'
        : !canManage
          ? `You do not have permission to ${id === null ? 'create' : 'edit'} products.`
          : error;

    return (
        <div className="admin-page product-form-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Product catalogue</p>
                    <h1>{product ? `Edit ${product.sku}` : 'Create product'}</h1>
                    <p>Define product details, selling units, conversions, and prices for every active Region.</p>
                </div>
                <Button icon="chevronLeft" onClick={() => navigate('/admin/products')}>
                    Back to products
                </Button>
            </header>
            {pageError ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {pageError}
                    <Link to="/admin/products">Return to products</Link>
                </div>
            ) : loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    Loading product form…
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
    const [form, setForm] = useState<ProductInput>({
        barcode: '',
        category: '',
        description: '',
        is_active: true,
        name: '',
        selling_price: 0,
        sku: '',
        unit: 'piece',
        units: [],
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setErrors({});
        const units = product?.units?.length
            ? product.units.map((unit) => ({
                  ...unit,
                  barcode: unit.barcode ?? '',
                  prices: (options.regions ?? []).map(
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
                      prices: (options.regions ?? []).map((region) => ({ region_id: region.id, price: 0 })),
                  },
              ];
        setForm({
            barcode: product?.barcode ?? '',
            category: product?.category ?? '',
            description: product?.description ?? '',
            is_active: product?.is_active ?? true,
            name: product?.name ?? '',
            selling_price: product?.selling_price ?? 0,
            sku: product?.sku ?? '',
            unit: product?.unit ?? 'piece',
            units,
        });
    }, [product, options.regions]);

    const change = (field: keyof ProductInput, value: boolean | number | string) =>
        setForm((current) => ({ ...current, [field]: value }));
    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (
            product?.is_active &&
            !form.is_active &&
            !window.confirm(
                `Deactivate ${product.name}? It will remain in history but cannot be used for new transactions.`,
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
            onSaved(product ? 'Product updated.' : 'Product created.');
        } catch (requestError) {
            if (requestError instanceof ProductApiError) setErrors(requestError.fields);
            setErrors((current) => ({
                ...current,
                form: [errorMessage(requestError)],
            }));
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="management-form product-form" id="product-management-form" onSubmit={submit}>
            <section className="product-form__intro">
                <div>
                    <p className="ui-eyebrow">Product definition</p>
                    <h2>Catalogue and pricing setup</h2>
                    <p>
                        Define the smallest stock unit, default selling unit, conversion factors, and prices for every
                        active Region.
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
                        <span>SKU</span>
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
                        <span>Product name</span>
                        <input
                            maxLength={255}
                            onChange={(event) => change('name', event.target.value)}
                            required
                            value={form.name}
                        />
                        <FieldError errors={errors} name="name" />
                    </label>
                    <label className="ui-field">
                        <span>Category</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('category', event.target.value)}
                            placeholder="Drinking Water"
                            value={form.category}
                        />
                        <FieldError errors={errors} name="category" />
                    </label>
                    <label className="ui-field">
                        <span>Legacy display unit</span>
                        <input
                            disabled
                            value={form.units.find((unit) => unit.is_default_selling)?.name ?? 'Not selected'}
                        />
                    </label>
                    <section className="product-unit-editor form-grid__wide">
                        <header>
                            <div>
                                <strong>Units and regional prices</strong>
                                <small>
                                    Stock is stored in the base unit. Conversion factors express how many base units are
                                    in one selected unit.
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
                                                prices: (options.regions ?? []).map((region) => ({
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
                                Add unit
                            </Button>
                        </header>
                        {form.units.map((unit, unitIndex) => (
                            <div className="product-unit-row" key={unit.id ?? `new-${unitIndex}`}>
                                <div className="product-unit-row__fields">
                                    <label className="ui-field">
                                        <span>Unit name</span>
                                        <input
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    units: value.units.map((item, index) =>
                                                        index === unitIndex
                                                            ? { ...item, name: event.target.value }
                                                            : item,
                                                    ),
                                                }))
                                            }
                                            placeholder="bottle / box"
                                            required
                                            value={unit.name}
                                        />
                                    </label>
                                    <label className="ui-field">
                                        <span>Base units per unit</span>
                                        <input
                                            disabled={unit.is_base}
                                            min={1}
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    units: value.units.map((item, index) =>
                                                        index === unitIndex
                                                            ? {
                                                                  ...item,
                                                                  conversion_factor: editableNumber(event.target.value),
                                                              }
                                                            : item,
                                                    ),
                                                }))
                                            }
                                            required
                                            type="number"
                                            value={unit.conversion_factor}
                                        />
                                    </label>
                                    <label className="ui-field">
                                        <span>Unit barcode</span>
                                        <input
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    units: value.units.map((item, index) =>
                                                        index === unitIndex
                                                            ? { ...item, barcode: event.target.value }
                                                            : item,
                                                    ),
                                                }))
                                            }
                                            value={unit.barcode ?? ''}
                                        />
                                    </label>
                                    <label className="ui-check">
                                        <input
                                            checked={unit.is_base}
                                            onChange={() =>
                                                setForm((value) => ({
                                                    ...value,
                                                    units: value.units.map((item, index) => ({
                                                        ...item,
                                                        is_base: index === unitIndex,
                                                        conversion_factor:
                                                            index === unitIndex ? 1 : item.conversion_factor,
                                                    })),
                                                }))
                                            }
                                            type="radio"
                                        />
                                        <span>
                                            <strong>Base unit</strong>
                                            <small>Smallest physical unit</small>
                                        </span>
                                    </label>
                                    <label className="ui-check">
                                        <input
                                            checked={unit.is_default_selling}
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
                                        <span>
                                            <strong>Default selling</strong>
                                            <small>Preselected in sales</small>
                                        </span>
                                    </label>
                                </div>
                                <div className="regional-price-grid">
                                    {(options.regions ?? []).map((region) => {
                                        const price =
                                            unit.prices.find((item) => item.region_id === region.id)?.price ?? 0;
                                        return (
                                            <label className="ui-field" key={region.id}>
                                                <span>
                                                    {region.warehouse.code} · {region.name}
                                                </span>
                                                <input
                                                    min={0}
                                                    onChange={(event) =>
                                                        setForm((value) => ({
                                                            ...value,
                                                            units: value.units.map((item, index) =>
                                                                index === unitIndex
                                                                    ? {
                                                                          ...item,
                                                                          prices: item.prices.map((entry) =>
                                                                              entry.region_id === region.id
                                                                                  ? {
                                                                                        ...entry,
                                                                                        price: editableNumber(
                                                                                            event.target.value,
                                                                                        ),
                                                                                    }
                                                                                  : entry,
                                                                          ),
                                                                      }
                                                                    : item,
                                                            ),
                                                        }))
                                                    }
                                                    required
                                                    type="number"
                                                    value={price}
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                                {form.units.length > 1 && !unit.is_base && !unit.is_default_selling ? (
                                    <Button
                                        onClick={() =>
                                            setForm((value) => ({
                                                ...value,
                                                units: value.units.filter((_, index) => index !== unitIndex),
                                            }))
                                        }
                                        tone="secondary"
                                        type="button"
                                    >
                                        Remove unit
                                    </Button>
                                ) : null}
                            </div>
                        ))}
                        <FieldError errors={errors} name="units" />
                    </section>
                    <label className="ui-field form-grid__wide">
                        <span>Description</span>
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
                            <strong>Active product</strong>
                            <small>
                                Inactive products remain in history but cannot be selected for new transactions.
                            </small>
                        </span>
                    </label>
                </div>
            </div>
            <footer className="product-form__actions">
                <Button disabled={saving} onClick={onCancel} type="button">
                    Cancel
                </Button>
                <Button disabled={saving} requiresOnline tone="primary" type="submit">
                    {saving ? 'Saving…' : 'Save product'}
                </Button>
            </footer>
        </form>
    );
}
