import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    reportingApi,
    type Identity,
    type ProductIdentity,
    type ReportFilters,
    type ReportName,
    type ReportOptions,
    type ReportResponse,
    type ReportRow,
} from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, MetricCard, Panel, StatusBadge } from '../../ui/primitives';

const labels: Record<ReportName, string> = {
    'warehouse-stock': 'Warehouse stock',
    'representative-stock': 'Representative stock',
    'stock-movements': 'Stock movements',
    'warehouse-transfers': 'Warehouse transfers',
    'representative-transfers': 'Representative transfers',
    sales: 'Sales',
    'cash-hold': 'Cash hold',
    'customer-credit': 'Customer credit',
};
const emptyOptions: ReportOptions = {
    warehouses: [],
    representatives: [],
    customers: [],
    products: [],
    categories: [],
    regions: [],
    reports: [],
};
const emptyResponse: ReportResponse = {
    report: 'warehouse-stock',
    data: [],
    meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        per_page: 25,
        to: null,
        total: 0,
    },
    summary: {},
    rules: {},
};
function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function money(value: number) {
    return `${number(value)} MMK`;
}
function dateTime(value: string | null | undefined) {
    return value
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load report.';
}
function statusTone(status: string) {
    return status === 'posted' || status === 'received'
        ? 'success'
        : status === 'draft' || status === 'dispatched'
          ? 'warning'
          : status === 'voided' || status === 'reversed'
            ? 'danger'
            : 'neutral';
}
function identity(value: unknown): Identity {
    return value as Identity;
}
function product(value: unknown): ProductIdentity {
    return value as ProductIdentity;
}
function text(value: unknown) {
    return value == null ? '—' : String(value);
}
function amount(value: unknown) {
    return Number(value ?? 0);
}

export function ReportsPage() {
    const [report, setReport] = useState<ReportName>('warehouse-stock');
    const [options, setOptions] = useState(emptyOptions);
    const [response, setResponse] = useState(emptyResponse);
    const [filters, setFilters] = useState<ReportFilters>({ page: 1 });
    const [draft, setDraft] = useState<ReportFilters>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(
        async (selectedReport = report, selectedFilters = filters) => {
            setLoading(true);
            setError('');
            try {
                setResponse(await reportingApi.report(selectedReport, selectedFilters));
            } catch (requestError) {
                setError(message(requestError));
            } finally {
                setLoading(false);
            }
        },
        [filters, report],
    );
    useEffect(() => {
        let active = true;
        void reportingApi
            .options()
            .then((value) => {
                if (active) setOptions(value);
            })
            .catch((requestError) => {
                if (active) setError(message(requestError));
            });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        let active = true;
        void reportingApi
            .report(report, filters)
            .then((value) => {
                if (active) {
                    setResponse(value);
                    setError('');
                }
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
    }, [filters, report]);
    const chooseReport = (value: ReportName) => {
        setReport(value);
        setDraft({});
        setFilters({ page: 1 });
        setLoading(true);
    };
    const apply = (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setFilters({ ...draft, page: 1 });
    };
    const summaryEntries = Object.entries(response.summary);
    const summaryMoney = new Set([
        'gross_sales',
        'cash_sales',
        'credit_sales',
        'cash_hold',
        'outstanding',
        'credit_limit',
    ]);
    return (
        <div className="admin-page reports-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Management intelligence</p>
                    <h1>Reports</h1>
                    <p>
                        Warehouse-scoped operational and financial views backed by current balances and posted ledgers.
                    </p>
                </div>
                <div className="report-rule-note">
                    <Icon name="reports" size={16} />
                    <span>Financial totals include Posted records only.</span>
                </div>
            </header>
            <nav aria-label="Report types" className="section-tabs section-tabs--4 report-tabs">
                {(Object.keys(labels) as ReportName[]).map((name) => (
                    <button
                        aria-current={report === name ? 'page' : undefined}
                        key={name}
                        onClick={() => chooseReport(name)}
                    >
                        <Icon
                            name={
                                name.includes('stock')
                                    ? 'box'
                                    : name === 'sales'
                                      ? 'sales'
                                      : name.includes('cash') || name.includes('credit')
                                        ? 'cash'
                                        : 'transfer'
                            }
                            size={15}
                        />
                        <span>{labels[name]}</span>
                    </button>
                ))}
            </nav>
            <section aria-label="Report summary" className="metric-grid report-metrics">
                {summaryEntries.slice(0, 4).map(([key, value]) => (
                    <MetricCard
                        hint="Current filters"
                        icon={
                            key.includes('unit')
                                ? 'box'
                                : key.includes('sale') ||
                                    key.includes('amount') ||
                                    key.includes('cash') ||
                                    key.includes('credit') ||
                                    key === 'outstanding'
                                  ? 'cash'
                                  : 'reports'
                        }
                        key={key}
                        label={key.replaceAll('_', ' ')}
                        value={summaryMoney.has(key) ? money(value) : number(value)}
                    />
                ))}
                {summaryEntries.length === 0 ? (
                    <MetricCard
                        hint="Matching rows"
                        icon="reports"
                        label="Records"
                        value={String(response.meta.total)}
                    />
                ) : null}
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            <Panel eyebrow="Server-side report" title={labels[report]}>
                <form className="filter-toolbar report-filters" onSubmit={apply}>
                    <div className="report-filter-scroll">
                        <div className="report-filter-fields">
                            <label className="filter-search">
                                <Icon name="search" size={15} />
                                <input
                                    aria-label="Search report"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            search: event.target.value,
                                        }))
                                    }
                                    placeholder="Reference, code, or name"
                                    type="search"
                                    value={draft.search ?? ''}
                                />
                            </label>
                            <select
                                aria-label="Warehouse"
                                onChange={(event) =>
                                    setDraft((value) => ({
                                        ...value,
                                        warehouse_id: Number(event.target.value) || undefined,
                                    }))
                                }
                                value={draft.warehouse_id ?? 0}
                            >
                                <option value={0}>All warehouses</option>
                                {options.warehouses.map((row) => (
                                    <option key={row.id} value={row.id}>
                                        {row.code} · {row.name}
                                    </option>
                                ))}
                            </select>
                            {needsRepresentative(report) ? (
                                <select
                                    aria-label="Representative"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            representative_id: Number(event.target.value) || undefined,
                                        }))
                                    }
                                    value={draft.representative_id ?? 0}
                                >
                                    <option value={0}>All representatives</option>
                                    {options.representatives.map((row) => (
                                        <option key={row.id} value={row.id}>
                                            {row.code} · {row.name}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            {needsCustomer(report) ? (
                                <select
                                    aria-label="Customer"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            customer_id: Number(event.target.value) || undefined,
                                        }))
                                    }
                                    value={draft.customer_id ?? 0}
                                >
                                    <option value={0}>All customers</option>
                                    {options.customers.map((row) => (
                                        <option key={row.id} value={row.id}>
                                            {row.code} · {row.name}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            {needsProduct(report) ? (
                                <select
                                    aria-label="Product"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            product_id: Number(event.target.value) || undefined,
                                        }))
                                    }
                                    value={draft.product_id ?? 0}
                                >
                                    <option value={0}>All products</option>
                                    {options.products.map((row) => (
                                        <option key={row.id} value={row.id}>
                                            {row.sku} · {row.name}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            {report === 'sales' ? (
                                <select
                                    aria-label="Payment type"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            payment_type: event.target.value || undefined,
                                        }))
                                    }
                                    value={draft.payment_type ?? ''}
                                >
                                    <option value="">Cash & credit</option>
                                    <option value="cash">Cash</option>
                                    <option value="credit">Credit</option>
                                </select>
                            ) : null}
                            {hasStatus(report) ? (
                                <select
                                    aria-label="Status"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            status: event.target.value || undefined,
                                        }))
                                    }
                                    value={draft.status ?? ''}
                                >
                                    <option value="">All statuses</option>
                                    {statusOptions(report).map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            {hasDates(report) ? (
                                <>
                                    <label className="report-date">
                                        <span>From</span>
                                        <input
                                            aria-label="Date from"
                                            onChange={(event) =>
                                                setDraft((value) => ({
                                                    ...value,
                                                    date_from: event.target.value || undefined,
                                                }))
                                            }
                                            type="date"
                                            value={draft.date_from ?? ''}
                                        />
                                    </label>
                                    <label className="report-date">
                                        <span>To</span>
                                        <input
                                            aria-label="Date to"
                                            onChange={(event) =>
                                                setDraft((value) => ({
                                                    ...value,
                                                    date_to: event.target.value || undefined,
                                                }))
                                            }
                                            type="date"
                                            value={draft.date_to ?? ''}
                                        />
                                    </label>
                                </>
                            ) : null}
                        </div>
                    </div>
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading {labels[report].toLowerCase()}…
                    </div>
                ) : response.data.length === 0 ? (
                    <EmptyState
                        description="Change the filters or wait for matching transactions."
                        title="No report rows"
                    />
                ) : (
                    <ReportTable report={report} rows={response.data} />
                )}
                <footer className="table-footer">
                    <span>
                        {response.meta.from ?? 0}–{response.meta.to ?? 0} of {response.meta.total}
                    </span>
                    <button
                        disabled={response.meta.current_page <= 1 || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: response.meta.current_page - 1,
                            }))
                        }
                    >
                        Previous
                    </button>
                    <strong>
                        Page {response.meta.current_page} of {response.meta.last_page}
                    </strong>
                    <button
                        disabled={response.meta.current_page >= response.meta.last_page || loading}
                        onClick={() =>
                            setFilters((value) => ({
                                ...value,
                                page: response.meta.current_page + 1,
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

function ReportTable({ report, rows }: { report: ReportName; rows: ReportRow[] }) {
    if (report === 'warehouse-stock')
        return (
            <Table headers={['Warehouse', 'Product', 'Category', 'Quantity']}>
                {rows.map((row) => {
                    const warehouse = identity(row.warehouse);
                    const item = product(row.product);
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{warehouse.name}</strong>
                                <small>{warehouse.code}</small>
                            </td>
                            <td>
                                <strong>{item.name}</strong>
                                <small>
                                    {item.sku} · {item.unit}
                                </small>
                            </td>
                            <td>{item.category ?? '—'}</td>
                            <td className="is-numeric">
                                <strong>{number(amount(row.quantity))}</strong>
                            </td>
                        </tr>
                    );
                })}
            </Table>
        );
    if (report === 'representative-stock')
        return (
            <Table headers={['Representative', 'Warehouse', 'Product', 'Quantity']}>
                {rows.map((row) => {
                    const rep = identity(row.representative);
                    const warehouse = identity(row.warehouse);
                    const item = product(row.product);
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{rep.name}</strong>
                                <small>{rep.code}</small>
                            </td>
                            <td>
                                {warehouse.name}
                                <small>{warehouse.code}</small>
                            </td>
                            <td>
                                <strong>{item.name}</strong>
                                <small>{item.sku}</small>
                            </td>
                            <td className="is-numeric">
                                <strong>{number(amount(row.quantity))}</strong>
                            </td>
                        </tr>
                    );
                })}
            </Table>
        );
    if (report === 'stock-movements')
        return (
            <Table headers={['Reference', 'Product', 'Movement', 'Quantity', 'Actor / time']}>
                {rows.map((row) => {
                    const item = product(row.product);
                    const actor = row.actor as { name: string };
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{text(row.reference)}</strong>
                            </td>
                            <td>
                                {item.name}
                                <small>{item.sku}</small>
                            </td>
                            <td>
                                <StatusBadge
                                    tone={
                                        text(row.type).includes('OUT') || text(row.type).includes('DISPATCH')
                                            ? 'warning'
                                            : 'success'
                                    }
                                >
                                    {text(row.type).replaceAll('_', ' ')}
                                </StatusBadge>
                            </td>
                            <td className="is-numeric">
                                <strong>{number(amount(row.quantity))}</strong>
                            </td>
                            <td>
                                {actor.name}
                                <small>{dateTime(text(row.occurred_at))}</small>
                            </td>
                        </tr>
                    );
                })}
            </Table>
        );
    if (report === 'sales')
        return (
            <Table headers={['Invoice', 'Representative', 'Customer', 'Payment', 'Total', 'Status', 'Date']}>
                {rows.map((row) => {
                    const rep = identity(row.representative);
                    const customer = identity(row.customer);
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{text(row.reference)}</strong>
                                <small>{number(amount(row.total_quantity))} units</small>
                            </td>
                            <td>
                                {rep.name}
                                <small>{rep.code}</small>
                            </td>
                            <td>
                                {customer.name}
                                <small>{customer.code}</small>
                            </td>
                            <td>{text(row.payment_type)}</td>
                            <td className="is-numeric">
                                <strong>{money(amount(row.total_amount))}</strong>
                            </td>
                            <td>
                                <StatusBadge tone={statusTone(text(row.status))}>{text(row.status)}</StatusBadge>
                            </td>
                            <td>{dateTime(text(row.date))}</td>
                        </tr>
                    );
                })}
            </Table>
        );
    if (report === 'cash-hold')
        return (
            <Table headers={['Representative', 'Warehouse', 'Current cash']}>
                {rows.map((row) => {
                    const rep = identity(row.representative);
                    const warehouse = identity(row.warehouse);
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{rep.name}</strong>
                                <small>{rep.code}</small>
                            </td>
                            <td>
                                {warehouse.name}
                                <small>{warehouse.code}</small>
                            </td>
                            <td className="is-numeric">
                                <strong>{money(amount(row.cash_hold))}</strong>
                            </td>
                        </tr>
                    );
                })}
            </Table>
        );
    if (report === 'customer-credit')
        return (
            <Table headers={['Customer', 'Warehouse', 'Credit', 'Limit', 'Outstanding', 'Available']}>
                {rows.map((row) => {
                    const customer = identity(row.customer);
                    const warehouse = identity(row.warehouse);
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{customer.name}</strong>
                                <small>{customer.code}</small>
                            </td>
                            <td>{warehouse.name}</td>
                            <td>
                                <StatusBadge tone={row.credit_allowed ? 'success' : 'neutral'}>
                                    {row.credit_allowed ? 'allowed' : 'cash only'}
                                </StatusBadge>
                            </td>
                            <td className="is-numeric">{money(amount(row.credit_limit))}</td>
                            <td className="is-numeric">
                                <strong>{money(amount(row.outstanding_amount))}</strong>
                            </td>
                            <td className="is-numeric">{money(amount(row.available_credit))}</td>
                        </tr>
                    );
                })}
            </Table>
        );
    if (report === 'warehouse-transfers')
        return (
            <Table headers={['Transfer', 'Route', 'Products / units', 'Status', 'Created / received']}>
                {rows.map((row) => {
                    const source = identity(row.source);
                    const destination = identity(row.destination);
                    const items = row.items as Array<{
                        product: ProductIdentity;
                        quantity: number;
                    }>;
                    return (
                        <tr key={Number(row.id)}>
                            <td>
                                <strong>{text(row.reference)}</strong>
                            </td>
                            <td>
                                {source.code} → {destination.code}
                            </td>
                            <td>
                                <strong>
                                    {items.length} / {number(amount(row.total_quantity))}
                                </strong>
                                <small>{items.map((item) => item.product.sku).join(', ')}</small>
                            </td>
                            <td>
                                <StatusBadge tone={statusTone(text(row.status))}>{text(row.status)}</StatusBadge>
                            </td>
                            <td>
                                {dateTime(text(row.created_at))}
                                <small>{dateTime(row.received_at as string | null)}</small>
                            </td>
                        </tr>
                    );
                })}
            </Table>
        );
    return (
        <Table
            headers={['Transfer', 'Warehouse', 'Representative', 'Products / units', 'Status', 'Dispatch / receipt']}
        >
            {rows.map((row) => {
                const warehouse = identity(row.warehouse);
                const rep = identity(row.representative);
                const items = row.items as Array<{
                    product: ProductIdentity;
                    quantity: number;
                }>;
                return (
                    <tr key={Number(row.id)}>
                        <td>
                            <strong>{text(row.reference)}</strong>
                        </td>
                        <td>
                            {warehouse.name}
                            <small>{warehouse.code}</small>
                        </td>
                        <td>
                            {rep.name}
                            <small>{rep.code}</small>
                        </td>
                        <td>
                            <strong>
                                {items.length} / {number(amount(row.total_quantity))}
                            </strong>
                        </td>
                        <td>
                            <StatusBadge tone={statusTone(text(row.status))}>{text(row.status)}</StatusBadge>
                        </td>
                        <td>
                            {dateTime(row.dispatched_at as string | null)}
                            <small>{dateTime(row.received_at as string | null)}</small>
                        </td>
                    </tr>
                );
            })}
        </Table>
    );
}
function Table({ children, headers }: { children: React.ReactNode; headers: string[] }) {
    return (
        <div className="ui-table-wrap report-table-wrap">
            <table className="ui-table report-table">
                <thead>
                    <tr>
                        {headers.map((header) => (
                            <th
                                className={
                                    ['Quantity', 'Total', 'Current cash', 'Limit', 'Outstanding', 'Available'].includes(
                                        header,
                                    )
                                        ? 'is-numeric'
                                        : ''
                                }
                                key={header}
                            >
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}
function needsRepresentative(report: ReportName) {
    return ['representative-stock', 'stock-movements', 'representative-transfers', 'sales', 'cash-hold'].includes(
        report,
    );
}
function needsCustomer(report: ReportName) {
    return ['sales', 'customer-credit'].includes(report);
}
function needsProduct(report: ReportName) {
    return [
        'warehouse-stock',
        'representative-stock',
        'stock-movements',
        'warehouse-transfers',
        'representative-transfers',
        'sales',
    ].includes(report);
}
function hasStatus(report: ReportName) {
    return ['warehouse-transfers', 'representative-transfers', 'sales'].includes(report);
}
function hasDates(report: ReportName) {
    return ['stock-movements', 'warehouse-transfers', 'representative-transfers', 'sales'].includes(report);
}
function statusOptions(report: ReportName) {
    return report === 'sales'
        ? ['draft', 'posted', 'voided']
        : ['draft', 'dispatched', 'received', 'cancelled', 'reversed'];
}
