import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    SaleApiError,
    saleApi,
    type PaymentType,
    type Sale,
    type SaleInput,
    type SaleOptions,
} from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, IconButton, StatusBadge } from '../../ui/primitives';

const emptyOptions: SaleOptions = {
    cash_hold: 0,
    customers: [],
    products: [],
    representative: { code: '', id: 0, name: '' },
};
const emptyForm: SaleInput = {
    customer_id: 0,
    items: [{ product_id: 0, quantity: 1 }],
    notes: '',
    payment_type: 'cash',
};
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

export function SalesWorkspacePage({ initialView = 'entry' }: { initialView?: 'entry' | 'history' }) {
    const [view, setView] = useState(initialView);
    const [options, setOptions] = useState(emptyOptions);
    const [sales, setSales] = useState<Sale[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [editing, setEditing] = useState<Sale | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [fields, setFields] = useState<Record<string, string[]>>({});
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [nextOptions, history] = await Promise.all([saleApi.options(), saleApi.ownSales()]);
            setOptions(nextOptions);
            setSales(history.data);
            setForm((value) => ({
                ...value,
                customer_id: value.customer_id || nextOptions.customers[0]?.id || 0,
                items: value.items.map((item) => ({
                    ...item,
                    product_id: item.product_id || nextOptions.products[0]?.id || 0,
                })),
            }));
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        let active = true;
        void Promise.all([saleApi.options(), saleApi.ownSales()])
            .then(([nextOptions, history]) => {
                if (!active) return;
                setOptions(nextOptions);
                setSales(history.data);
                setForm((value) => ({
                    ...value,
                    customer_id: value.customer_id || nextOptions.customers[0]?.id || 0,
                    items: value.items.map((item) => ({
                        ...item,
                        product_id: item.product_id || nextOptions.products[0]?.id || 0,
                    })),
                }));
                setError('');
            })
            .catch((requestError) => {
                if (active) setError(message(requestError));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);
    const selectedCustomer = options.customers.find((customer) => customer.id === form.customer_id);
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
    const quantity = form.items.reduce((sum, line) => sum + line.quantity, 0);
    const showNotice = (value: string) => {
        setNotice(value);
        window.setTimeout(() => setNotice(''), 4500);
    };
    const reset = () => {
        setEditing(null);
        setFields({});
        setForm({
            ...emptyForm,
            customer_id: options.customers[0]?.id ?? 0,
            items: [{ product_id: options.products[0]?.id ?? 0, quantity: 1 }],
        });
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
        void save(false);
    };
    const edit = (sale: Sale) => {
        setEditing(sale);
        setForm({
            customer_id: sale.customer.id,
            payment_type: sale.payment_type,
            notes: sale.notes ?? '',
            items: sale.items.map((item) => ({
                product_id: item.product.id,
                quantity: item.quantity,
            })),
        });
        setView('entry');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const postDraft = async (sale: Sale) => {
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
                    {view === 'entry' ? 'Server priced' : `${sales.length} recent`}
                </StatusBadge>
            </header>
            <div className="sales-view-tabs" role="tablist">
                <button aria-selected={view === 'entry'} onClick={() => setView('entry')} role="tab">
                    New sale
                </button>
                <button aria-selected={view === 'history'} onClick={() => setView('history')} role="tab">
                    History
                </button>
            </div>
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
                                <div className="sale-header-fields">
                                    <label className="ui-field">
                                        <span>Customer</span>
                                        <select
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    customer_id: Number(event.target.value),
                                                }))
                                            }
                                            required
                                            value={form.customer_id}
                                        >
                                            {options.customers.map((customer) => (
                                                <option key={customer.id} value={customer.id}>
                                                    {customer.code} · {customer.name}
                                                </option>
                                            ))}
                                        </select>
                                        {fields.customer_id?.[0] ? (
                                            <small className="ui-field__error">{fields.customer_id[0]}</small>
                                        ) : null}
                                    </label>
                                    <label className="ui-field">
                                        <span>Payment</span>
                                        <select
                                            onChange={(event) =>
                                                setForm((value) => ({
                                                    ...value,
                                                    payment_type: event.target.value as PaymentType,
                                                }))
                                            }
                                            required
                                            value={form.payment_type}
                                        >
                                            <option value="cash">Cash</option>
                                            <option value="credit">Credit</option>
                                        </select>
                                        {fields.payment_type?.[0] ? (
                                            <small className="ui-field__error">{fields.payment_type[0]}</small>
                                        ) : null}
                                    </label>
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
                                <div className="sale-lines">
                                    <div className="sale-lines__heading">
                                        <strong>Products</strong>
                                        <Button
                                            icon="plus"
                                            onClick={() =>
                                                setForm((value) => ({
                                                    ...value,
                                                    items: [
                                                        ...value.items,
                                                        {
                                                            product_id:
                                                                options.products.find(
                                                                    (product) =>
                                                                        !value.items.some(
                                                                            (item) => item.product_id === product.id,
                                                                        ),
                                                                )?.id ?? 0,
                                                            quantity: 1,
                                                        },
                                                    ],
                                                }))
                                            }
                                        >
                                            Add
                                        </Button>
                                    </div>
                                    {form.items.map((line, index) => {
                                        const product = options.products.find((item) => item.id === line.product_id);
                                        return (
                                            <div className="sale-line" key={index}>
                                                <label className="ui-field">
                                                    <span>Product {index + 1}</span>
                                                    <select
                                                        onChange={(event) =>
                                                            setForm((value) => ({
                                                                ...value,
                                                                items: value.items.map((item, itemIndex) =>
                                                                    itemIndex === index
                                                                        ? {
                                                                              ...item,
                                                                              product_id: Number(event.target.value),
                                                                          }
                                                                        : item,
                                                                ),
                                                            }))
                                                        }
                                                        required
                                                        value={line.product_id}
                                                    >
                                                        <option value={0}>Select product</option>
                                                        {options.products.map((option) => (
                                                            <option
                                                                disabled={form.items.some(
                                                                    (item, itemIndex) =>
                                                                        itemIndex !== index &&
                                                                        item.product_id === option.id,
                                                                )}
                                                                key={option.id}
                                                                value={option.id}
                                                            >
                                                                {option.sku} · {option.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <small>
                                                        {fields[`items.${index}.product_id`]?.[0] ??
                                                            (product
                                                                ? `${product.quantity} available · ${money(product.selling_price)}`
                                                                : 'Select stock')}
                                                    </small>
                                                </label>
                                                <label className="ui-field sale-line__quantity">
                                                    <span>Qty</span>
                                                    <input
                                                        max={product?.quantity ?? 100}
                                                        min={1}
                                                        onChange={(event) =>
                                                            setForm((value) => ({
                                                                ...value,
                                                                items: value.items.map((item, itemIndex) =>
                                                                    itemIndex === index
                                                                        ? {
                                                                              ...item,
                                                                              quantity: Number(event.target.value),
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
                                                <strong className="sale-line__total">
                                                    {money((product?.selling_price ?? 0) * line.quantity)}
                                                </strong>
                                                <IconButton
                                                    disabled={form.items.length === 1}
                                                    icon="x"
                                                    label={`Remove product ${index + 1}`}
                                                    onClick={() =>
                                                        setForm((value) => ({
                                                            ...value,
                                                            items: value.items.filter(
                                                                (_, itemIndex) => itemIndex !== index,
                                                            ),
                                                        }))
                                                    }
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <footer className="sale-form-actions">
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
                                </footer>
                            </>
                        )}
                    </form>
                    <aside className="sales-section sale-summary">
                        <header>
                            <div>
                                <p className="ui-eyebrow">Server preview</p>
                                <h2>Sale summary</h2>
                            </div>
                        </header>
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
                                <dt>Products / units</dt>
                                <dd>
                                    {form.items.length} / {quantity}
                                </dd>
                            </div>
                            <div className="sale-summary__total">
                                <dt>Preview total</dt>
                                <dd>{money(preview)}</dd>
                            </div>
                        </dl>
                        {form.payment_type === 'credit' ? (
                            <div
                                className={`credit-check ${selectedCustomer?.credit_allowed && preview <= (selectedCustomer?.available_credit ?? 0) ? 'is-valid' : 'is-warning'}`}
                            >
                                <strong>
                                    {selectedCustomer?.credit_allowed
                                        ? `${money(selectedCustomer.available_credit)} available`
                                        : 'Credit disabled'}
                                </strong>
                                <small>Backend rechecks the locked outstanding balance during posting.</small>
                            </div>
                        ) : (
                            <div className="credit-check is-valid">
                                <strong>Cash sale</strong>
                                <small>Posted total increases your cash hold exactly once.</small>
                            </div>
                        )}
                        <p className="sale-server-note">
                            Prices and totals shown here are previews. Laravel stores and validates the authoritative
                            values.
                        </p>
                    </aside>
                </div>
            ) : (
                <section className="sales-section sales-history">
                    <header>
                        <div>
                            <p className="ui-eyebrow">Own transactions</p>
                            <h2>Recent sales</h2>
                        </div>
                        <Button
                            icon="plus"
                            onClick={() => {
                                reset();
                                setView('entry');
                            }}
                            tone="primary"
                        >
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
                                    <div className="sales-history__identity">
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
                                    </div>
                                    <div className="sales-history__amount">
                                        <strong>{money(sale.total_amount)}</strong>
                                        <small>
                                            {sale.total_quantity} units · {sale.payment_type}
                                        </small>
                                    </div>
                                    <StatusBadge tone={tone(sale.status)}>{sale.status}</StatusBadge>
                                    {sale.status === 'draft' ? (
                                        <div className="sales-history__actions">
                                            <Button onClick={() => edit(sale)}>Edit</Button>
                                            <Button
                                                disabled={saving}
                                                onClick={() => void postDraft(sale)}
                                                requiresOnline
                                                tone="primary"
                                            >
                                                Post
                                            </Button>
                                        </div>
                                    ) : null}
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
