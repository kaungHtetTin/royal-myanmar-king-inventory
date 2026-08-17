import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import {
    ProductApiError,
    productApi,
    type Product,
    type ProductFilters,
    type ProductInput,
    type ProductOptions,
} from '../../services/products';
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
const emptyOptions: ProductOptions = { categories: [], units: [] };

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
    const { user } = useSession();
    const isSuperAdmin = user?.roles.includes('super-admin');
    const canCreate = Boolean(isSuperAdmin || user?.permissions.includes('product.create'));
    const canEdit = Boolean(isSuperAdmin || user?.permissions.includes('product.edit'));
    const [products, setProducts] = useState<Product[]>([]);
    const [options, setOptions] = useState<ProductOptions>(emptyOptions);
    const [meta, setMeta] = useState(emptyMeta);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selected, setSelected] = useState<Product | null>(null);
    const [draftFilters, setDraftFilters] = useState({
        category: '',
        search: '',
        sort: 'name:asc',
        status: '',
        unit: '',
    });
    const [filters, setFilters] = useState<ProductFilters>({
        direction: 'asc',
        page: 1,
        sort: 'name',
    });

    const loadProducts = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [response, availableOptions] = await Promise.all([productApi.list(filters), productApi.options()]);
            setProducts(response.data);
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
        void Promise.all([productApi.list(filters), productApi.options()])
            .then(([response, availableOptions]) => {
                if (!active) return;
                setProducts(response.data);
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

    const activeCount = products.filter((product) => product.is_active).length;
    const categoryCount = new Set(products.map((product) => product.category).filter(Boolean)).size;
    const showNotice = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(''), 4000);
    };

    return (
        <div className="admin-page product-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Master data</p>
                    <h1>Products</h1>
                    <p>Maintain the sellable catalogue, units, barcodes, and default MMK prices.</p>
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
                        New product
                    </Button>
                ) : null}
            </header>

            <div className="metric-grid access-metrics">
                <MetricCard hint="Current filtered result" icon="box" label="Products" value={String(meta.total)} />
                <MetricCard hint="On this page" icon="dashboard" label="Active" value={String(activeCount)} />
                <MetricCard
                    hint="On this page"
                    icon="adjustments"
                    label="Inactive"
                    value={String(products.length - activeCount)}
                />
                <MetricCard hint="On this page" icon="reports" label="Categories" value={String(categoryCount)} />
            </div>

            {notice ? (
                <div className="ui-flash ui-flash--success" role="status">
                    <Icon name="box" size={15} />
                    {notice}
                </div>
            ) : null}
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
                        const [sort, direction] = draftFilters.sort.split(':') as [string, 'asc' | 'desc'];
                        setLoading(true);
                        setFilters({
                            category: draftFilters.category,
                            direction,
                            page: 1,
                            search: draftFilters.search,
                            sort,
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
                    <label>
                        <span className="sr-only">Sort products</span>
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
                            <option value="sku:asc">SKU A-Z</option>
                            <option value="selling_price:desc">Highest price</option>
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
                                                    onClick={() => {
                                                        setSelected(product);
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

            <ProductDialog
                onClose={() => setDialogOpen(false)}
                onSaved={async (message) => {
                    setDialogOpen(false);
                    await loadProducts();
                    showNotice(message);
                }}
                open={dialogOpen}
                product={selected}
            />
        </div>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}

function ProductDialog({
    onClose,
    onSaved,
    open,
    product,
}: {
    onClose: () => void;
    onSaved: (message: string) => Promise<void>;
    open: boolean;
    product: Product | null;
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
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setErrors({});
        setForm({
            barcode: product?.barcode ?? '',
            category: product?.category ?? '',
            description: product?.description ?? '',
            is_active: product?.is_active ?? true,
            name: product?.name ?? '',
            selling_price: product?.selling_price ?? 0,
            sku: product?.sku ?? '',
            unit: product?.unit ?? 'piece',
        });
    }, [open, product]);

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
            if (product) await productApi.update(product.id, form);
            else await productApi.create(form);
            await onSaved(product ? 'Product updated.' : 'Product created.');
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
        <Dialog
            description="SKU identifies this product across stock, sales, and reports. Prices use whole Myanmar kyat."
            footer={
                <>
                    <Button disabled={saving} onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        disabled={saving}
                        form="product-management-form"
                        requiresOnline
                        tone="primary"
                        type="submit"
                    >
                        {saving ? 'Saving…' : 'Save product'}
                    </Button>
                </>
            }
            onClose={onClose}
            open={open}
            title={product ? `Edit product · ${product.sku}` : 'Create product'}
        >
            <form className="management-form" id="product-management-form" onSubmit={submit}>
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
                        <span>Unit</span>
                        <input
                            maxLength={50}
                            onChange={(event) => change('unit', event.target.value)}
                            placeholder="bottle"
                            required
                            value={form.unit}
                        />
                        <FieldError errors={errors} name="unit" />
                    </label>
                    <label className="ui-field">
                        <span>Default selling price (MMK)</span>
                        <input
                            min={0}
                            onChange={(event) => change('selling_price', Number(event.target.value))}
                            required
                            step={1}
                            type="number"
                            value={form.selling_price}
                        />
                        <FieldError errors={errors} name="selling_price" />
                    </label>
                    <label className="ui-field">
                        <span>Barcode</span>
                        <input
                            maxLength={100}
                            onChange={(event) => change('barcode', event.target.value)}
                            value={form.barcode}
                        />
                        <FieldError errors={errors} name="barcode" />
                    </label>
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
            </form>
        </Dialog>
    );
}
