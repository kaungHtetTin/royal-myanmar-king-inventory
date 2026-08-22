import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import { saleApi, type Sale, type SaleFilters } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, IconButton, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
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
    return error instanceof Error ? error.message : 'Unable to load sales.';
}
function tone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

export function SalesManagementPage() {
    const { user } = useSession();
    const canVoid = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('sale.void'));
    const [rows, setRows] = useState<Sale[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [filters, setFilters] = useState<SaleFilters>({ page: 1 });
    const [draft, setDraft] = useState({
        payment_type: '',
        search: '',
        status: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await saleApi.adminSales(filters);
            setRows(response.data);
            setMeta(response.meta);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);
    useEffect(() => {
        let active = true;
        void saleApi
            .adminSales(filters)
            .then((response) => {
                if (!active) return;
                setRows(response.data);
                setMeta(response.meta);
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
    }, [filters]);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        setFilters({ ...draft, page: 1 });
    };
    const voidSale = async (sale: Sale) => {
        const reason = window.prompt(
            `Reason for voiding ${sale.reference}? Stock and financial effects will be reversed.`,
        );
        if (!reason?.trim()) return;
        setLoading(true);
        try {
            await saleApi.void(sale.id, reason.trim());
            await load();
            setNotice(`${sale.reference} voided with compensating entries.`);
            window.setTimeout(() => setNotice(''), 4500);
        } catch (requestError) {
            setError(message(requestError));
            setLoading(false);
        }
    };
    const posted = rows.filter((row) => row.status === 'posted');
    const pageTotal = posted.reduce((sum, row) => sum + row.total_amount, 0);
    const cashTotal = posted
        .filter((row) => row.payment_type === 'cash')
        .reduce((sum, row) => sum + row.total_amount, 0);
    const creditTotal = posted
        .filter((row) => row.payment_type === 'credit')
        .reduce((sum, row) => sum + row.total_amount, 0);

    return (
        <div className="admin-page sales-management">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Customer transactions</p>
                    <h1>Sales</h1>
                    <p>
                        Review representative sales, payment effects, immutable lines, and controlled reversals across
                        assigned warehouses.
                    </p>
                </div>
            </header>
            <div className="metric-grid access-metrics">
                <MetricCard
                    hint="Matching current filters"
                    icon="sales"
                    label="Sales records"
                    value={String(meta.total)}
                />
                <MetricCard
                    hint="Posted rows on this page"
                    icon="reports"
                    label="Page total"
                    value={money(pageTotal)}
                />
                <MetricCard hint="Increases representative hold" icon="cash" label="Cash" value={money(cashTotal)} />
                <MetricCard
                    hint="Increases customer outstanding"
                    icon="customers"
                    label="Credit"
                    value={money(creditTotal)}
                />
            </div>
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
            <Panel eyebrow="Sales register" title="Representative sales">
                <form className="filter-toolbar sales-filters" onSubmit={submit}>
                    <label className="filter-search">
                        <Icon name="search" size={15} />
                        <input
                            aria-label="Search sale reference"
                            onChange={(event) =>
                                setDraft((value) => ({
                                    ...value,
                                    search: event.target.value,
                                }))
                            }
                            placeholder="Sale reference"
                            type="search"
                            value={draft.search}
                        />
                    </label>
                    <select
                        aria-label="Sale status"
                        onChange={(event) =>
                            setDraft((value) => ({
                                ...value,
                                status: event.target.value,
                            }))
                        }
                        value={draft.status}
                    >
                        <option value="">All statuses</option>
                        <option value="draft">Draft</option>
                        <option value="posted">Posted</option>
                        <option value="voided">Voided</option>
                    </select>
                    <select
                        aria-label="Payment type"
                        onChange={(event) =>
                            setDraft((value) => ({
                                ...value,
                                payment_type: event.target.value,
                            }))
                        }
                        value={draft.payment_type}
                    >
                        <option value="">All payments</option>
                        <option value="cash">Cash</option>
                        <option value="credit">Credit</option>
                    </select>
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading sales…
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState
                        description="No sales match the current warehouse scope and filters."
                        title="No sales found"
                    />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table admin-sales-table">
                            <thead>
                                <tr>
                                    <th>Sale</th>
                                    <th>Representative</th>
                                    <th>Customer</th>
                                    <th>Products</th>
                                    <th>Payment</th>
                                    <th className="is-numeric">Total</th>
                                    <th>Status</th>
                                    <th className="ui-table__actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((sale) => (
                                    <tr key={sale.id}>
                                        <td>
                                            <strong>{sale.reference}</strong>
                                            <small>{dateTime(sale.created_at)}</small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{sale.representative.name}</span>
                                            <small>
                                                {sale.representative.code} · {sale.warehouse.code}
                                            </small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{sale.customer.name}</span>
                                            <small>{sale.customer.code}</small>
                                        </td>
                                        <td>
                                            <strong>
                                                {sale.items.length} / {sale.total_quantity}
                                            </strong>
                                            <small>
                                                {sale.items
                                                    .map((item) => `${item.product.sku} × ${item.quantity}`)
                                                    .join(', ')}
                                            </small>
                                        </td>
                                        <td>
                                            <span className="table-primary">{sale.payment_type}</span>
                                            <small>
                                                {sale.payment_type === 'cash' ? 'Cash hold' : 'Outstanding credit'}
                                            </small>
                                        </td>
                                        <td className="is-numeric">
                                            <strong>{money(sale.total_amount)}</strong>
                                        </td>
                                        <td>
                                            <StatusBadge tone={tone(sale.status)}>{sale.status}</StatusBadge>
                                        </td>
                                        <td className="ui-table__actions">
                                            {sale.status === 'posted' && canVoid ? (
                                                <IconButton
                                                    icon="reverse"
                                                    label={`Void ${sale.reference}`}
                                                    onClick={() => void voidSale(sale)}
                                                    requiresOnline
                                                    tone="danger"
                                                />
                                            ) : sale.status === 'voided' ? (
                                                <small>{sale.void_reason}</small>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <footer className="table-footer">
                    <span>
                        {meta.from ?? 0}–{meta.to ?? 0} of {meta.total}
                    </span>
                    <button
                        disabled={meta.current_page <= 1 || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page - 1,
                            }))
                        }
                    >
                        Previous
                    </button>
                    <strong>
                        Page {meta.current_page} of {meta.last_page}
                    </strong>
                    <button
                        disabled={meta.current_page >= meta.last_page || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: meta.current_page + 1,
                            }))
                        }
                    >
                        Next
                    </button>
                </footer>
            </Panel>
        </div>
    );
}
