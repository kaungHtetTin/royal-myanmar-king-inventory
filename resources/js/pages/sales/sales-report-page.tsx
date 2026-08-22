import { useCallback, useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import {
    reportingApi,
    type ReportFilters,
    type ReportResponse,
    type RepresentativeReportOptions,
} from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { Button, Drawer, EmptyState, StatusBadge } from '../../ui/primitives';

const optionsEmpty: RepresentativeReportOptions = {
    customers: [],
    products: [],
};
const responseEmpty: Omit<ReportResponse, 'report'> = {
    data: [],
    meta: {
        current_page: 1,
        from: null,
        last_page: 1,
        per_page: 20,
        to: null,
        total: 0,
    },
    summary: { gross_sales: 0, cash_sales: 0, credit_sales: 0, units_sold: 0 },
    rules: {},
};
type OwnFilters = ReportFilters & { period?: string };
function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function money(value: number) {
    return `${number(value)} MMK`;
}
function dateTime(value: unknown) {
    return typeof value === 'string'
        ? new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load sales report.';
}
function text(value: unknown) {
    return value == null ? '—' : String(value);
}

function SalesReportFilterFields({
    draft,
    options,
    setDraft,
}: {
    draft: OwnFilters;
    options: RepresentativeReportOptions;
    setDraft: Dispatch<SetStateAction<OwnFilters>>;
}) {
    return (
        <>
            <label className="ui-field">
                <span>Period</span>
                <select
                    onChange={(event) =>
                        setDraft((value) => ({
                            ...value,
                            period: event.target.value || undefined,
                        }))
                    }
                    value={draft.period ?? ''}
                >
                    <option value="today">Today</option>
                    <option value="">Date range</option>
                </select>
            </label>
            <label className="ui-field">
                <span>Customer</span>
                <select
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
            </label>
            <label className="ui-field">
                <span>Product</span>
                <select
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
            </label>
            <label className="ui-field">
                <span>Payment</span>
                <select
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
            </label>
            <label className="ui-field">
                <span>From</span>
                <input
                    disabled={draft.period === 'today'}
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
            <label className="ui-field">
                <span>To</span>
                <input
                    disabled={draft.period === 'today'}
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
    );
}

export function SalesReportPage() {
    const [options, setOptions] = useState(optionsEmpty);
    const [response, setResponse] = useState(responseEmpty);
    const [filters, setFilters] = useState<OwnFilters>({
        page: 1,
        period: 'today',
    });
    const [draft, setDraft] = useState<OwnFilters>({ period: 'today' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResponse(await reportingApi.ownSales(filters));
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);
    useEffect(() => {
        let active = true;
        void Promise.all([reportingApi.salesOptions(), reportingApi.ownSales({ page: 1, period: 'today' })])
            .then(([reportOptions, report]) => {
                if (!active) return;
                setOptions(reportOptions);
                setResponse(report);
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
    const closeFilterDrawer = useCallback(() => {
        const appliedFilters = { ...filters };
        delete appliedFilters.page;
        setDraft(appliedFilters);
        setFilterDrawerOpen(false);
    }, [filters]);
    const apply = (event: FormEvent) => {
        event.preventDefault();
        setFilters({ ...draft, page: 1 });
        setFilterDrawerOpen(false);
    };
    const summary = response.summary;
    return (
        <div className="sales-report-page">
            <header className="sales-page-heading">
                <div>
                    <p>Own transactions</p>
                    <h1>Sales report</h1>
                </div>
                <StatusBadge tone="info">Posted totals</StatusBadge>
            </header>
            <section aria-label="Sales report summary" className="sales-summary-grid sales-report-summary">
                <article className="sales-summary-card is-primary">
                    <span>
                        <Icon name="sales" size={18} />
                    </span>
                    <small>Gross sales</small>
                    <strong>{number(summary.gross_sales ?? 0)}</strong>
                    <p>MMK posted only</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="cash" size={18} />
                    </span>
                    <small>Cash / credit</small>
                    <strong>
                        {number(summary.cash_sales ?? 0)} / {number(summary.credit_sales ?? 0)}
                    </strong>
                    <p>MMK by payment type</p>
                </article>
                <article className="sales-summary-card">
                    <span>
                        <Icon name="box" size={18} />
                    </span>
                    <small>Units sold</small>
                    <strong>{number(summary.units_sold ?? 0)}</strong>
                    <p>Posted sale quantities</p>
                </article>
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}
            <section className="sales-section">
                <header>
                    <div>
                        <p className="ui-eyebrow">Filters</p>
                        <h2>My sales</h2>
                    </div>
                    <div className="sales-report-panel-actions">
                        <small>{response.meta.total} records</small>
                        <Button
                            className="sales-report-filter-trigger"
                            icon="adjustments"
                            onClick={() => setFilterDrawerOpen(true)}
                        >
                            Filters
                        </Button>
                    </div>
                </header>
                <form className="sales-report-filter-form sales-report-filters" onSubmit={apply}>
                    <SalesReportFilterFields draft={draft} options={options} setDraft={setDraft} />
                    <Button icon="search" tone="primary" type="submit">
                        Apply report
                    </Button>
                </form>
                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading sales report…
                    </div>
                ) : response.data.length === 0 ? (
                    <EmptyState description="Change the filters or create and post a sale." title="No matching sales" />
                ) : (
                    <div className="sales-report-list">
                        {response.data.map((row) => {
                            const customer = row.customer as {
                                code: string;
                                name: string;
                            };
                            return (
                                <article key={Number(row.id)}>
                                    <div>
                                        <strong>{text(row.reference)}</strong>
                                        <small>
                                            {customer.name} · {customer.code} · {dateTime(row.date)}
                                        </small>
                                    </div>
                                    <div>
                                        <strong>{money(Number(row.total_amount ?? 0))}</strong>
                                        <small>
                                            {number(Number(row.total_quantity ?? 0))} units · {text(row.payment_type)}
                                        </small>
                                    </div>
                                    <StatusBadge
                                        tone={
                                            row.status === 'posted'
                                                ? 'success'
                                                : row.status === 'draft'
                                                  ? 'warning'
                                                  : 'danger'
                                        }
                                    >
                                        {text(row.status)}
                                    </StatusBadge>
                                </article>
                            );
                        })}
                    </div>
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
                        {response.meta.current_page} / {response.meta.last_page}
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
            </section>
            <Drawer
                description="Choose the sales period and matching transaction details."
                footer={
                    <>
                        <Button onClick={closeFilterDrawer}>Cancel</Button>
                        <Button form="sales-report-mobile-filters" icon="search" tone="primary" type="submit">
                            Apply filters
                        </Button>
                    </>
                }
                onClose={closeFilterDrawer}
                open={filterDrawerOpen}
                title="Filter sales"
            >
                <form
                    className="sales-report-filter-form sales-report-drawer-form"
                    id="sales-report-mobile-filters"
                    onSubmit={apply}
                >
                    <SalesReportFilterFields draft={draft} options={options} setDraft={setDraft} />
                </form>
            </Drawer>
        </div>
    );
}
