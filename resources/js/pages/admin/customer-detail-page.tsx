import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import { customerApi, type Customer } from '../../services/customers';
import { saleApi, type Sale, type SaleSummary } from '../../services/sales';
import { Icon } from '../../ui/icons';
import { EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

const emptyMeta: PaginationMeta = {
    current_page: 1,
    from: null,
    last_page: 1,
    per_page: 20,
    to: null,
    total: 0,
};
const emptySummary: SaleSummary = { cash_total: 0, credit_total: 0, posted_total: 0, total: 0 };

function money(value: number) {
    return `${new Intl.NumberFormat('en-US').format(value)} MMK`;
}

function dateTime(value: string | null) {
    return value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';
}

function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load customer details.';
}

function saleTone(status: string) {
    return status === 'posted' ? 'success' : status === 'draft' ? 'warning' : 'neutral';
}

export function CustomerDetailPage() {
    const { customerId } = useParams();
    const { user } = useSession();
    const id = Number(customerId);
    const canViewSales = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('sale.view'));
    const [customer, setCustomer] = useState<Customer | null>(null);
    const [sales, setSales] = useState<Sale[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState(emptySummary);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!Number.isInteger(id) || id < 1) {
            setError('Invalid customer reference.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [customerResponse, salesResponse] = await Promise.all([
                customerApi.get(id),
                canViewSales ? saleApi.adminSales({ customer_id: id, page }) : Promise.resolve(null),
            ]);
            setCustomer(customerResponse.data);
            if (salesResponse) {
                setSales(salesResponse.data);
                setMeta(salesResponse.meta);
                setSummary(salesResponse.summary ?? emptySummary);
            }
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [canViewSales, id, page]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading && !customer) {
        return <div className="ui-loading" role="status"><span />Loading customer details…</div>;
    }

    if (!customer) {
        return (
            <div className="admin-page customer-detail-page">
                <div className="ui-flash ui-flash--danger" role="alert">{error || 'Customer not found.'}</div>
            </div>
        );
    }

    return (
        <div className="admin-page customer-detail-page">
            <header className="page-heading representative-detail-heading">
                <div>
                    <Link className="sale-detail-back" to="/admin/customers"><Icon name="chevronLeft" size={13} />Customers</Link>
                    <p className="ui-eyebrow">Customer profile</p>
                    <h1>{customer.name}</h1>
                    <p>{customer.code} · {customer.customer_type || 'Customer'} · {customer.warehouse.name}</p>
                </div>
                <StatusBadge tone={customer.is_active ? 'success' : 'danger'}>{customer.is_active ? 'Active' : 'Inactive'}</StatusBadge>
            </header>

            {error ? <div className="ui-flash ui-flash--danger" role="alert">{error}<button onClick={() => void load()} type="button">Retry</button></div> : null}

            <section aria-label="Customer sales summary" className="metric-grid customer-detail-kpis">
                <MetricCard hint="All recorded transactions" icon="sales" label="Sales" value={canViewSales ? String(summary.total) : 'Restricted'} />
                <MetricCard hint="Posted sales value" icon="cash" label="Posted total" value={canViewSales ? money(summary.posted_total) : 'Restricted'} />
                <MetricCard hint={customer.credit_allowed ? 'Office credit enabled' : 'Cash-only customer'} icon="cash" label="Credit limit" value={customer.credit_allowed ? money(customer.credit_limit) : 'Cash only'} />
            </section>

            <Panel eyebrow="Profile" title="Basic information">
                <dl className="customer-detail-facts">
                    <div><dt>Customer code</dt><dd>{customer.code}</dd></div>
                    <div><dt>Type</dt><dd>{customer.customer_type || 'Not specified'}</dd></div>
                    <div><dt>Phone</dt><dd>{customer.phone || 'Not specified'}</dd></div>
                    <div><dt>Warehouse</dt><dd>{customer.warehouse.name}<small>{customer.warehouse.code}</small></dd></div>
                    <div><dt>Location</dt><dd>{[customer.township, customer.region].filter(Boolean).join(', ') || 'Not specified'}</dd></div>
                    <div><dt>Address</dt><dd>{customer.address || 'Not specified'}</dd></div>
                    <div><dt>Notes</dt><dd>{customer.notes || 'No notes recorded'}</dd></div>
                    <div><dt>Created</dt><dd>{dateTime(customer.created_at)}<small>Updated {dateTime(customer.updated_at)}</small></dd></div>
                </dl>
            </Panel>

            <Panel eyebrow="Transactions" title="Sale history">
                {!canViewSales ? (
                    <EmptyState title="Sales history restricted" description="Sale view permission is required." />
                ) : sales.length === 0 ? (
                    <EmptyState title="No sales recorded" description="This customer's sales will appear here." />
                ) : (
                    <div className="ui-table-wrap">
                        <table className="ui-table customer-detail-sales-table">
                            <thead><tr><th>Reference</th><th>Representative</th><th>Payment</th><th className="is-numeric">Quantity</th><th className="is-numeric">Total</th><th>Status</th><th>Date</th></tr></thead>
                            <tbody>{sales.map((sale) => <tr key={sale.id}>
                                <td><strong>{sale.reference}</strong><small>{sale.warehouse.code}</small></td>
                                <td><strong>{sale.representative.name}</strong><small>{sale.representative.code}</small></td>
                                <td>{sale.payment_type === 'cash' ? 'Cash' : 'Credit'}</td>
                                <td className="is-numeric">{sale.total_quantity}</td>
                                <td className="is-numeric"><strong>{money(sale.total_amount)}</strong></td>
                                <td><StatusBadge tone={saleTone(sale.status)}>{sale.status}</StatusBadge></td>
                                <td>{dateTime(sale.posted_at ?? sale.created_at)}</td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                )}
                {canViewSales ? <footer className="table-footer"><span>{meta.from ?? 0}–{meta.to ?? 0} of {meta.total} sales</span><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} type="button">Previous</button><strong>Page {meta.current_page} of {meta.last_page}</strong><button disabled={page >= meta.last_page || loading} onClick={() => setPage((value) => value + 1)} type="button">Next</button></footer> : null}
            </Panel>
        </div>
    );
}
