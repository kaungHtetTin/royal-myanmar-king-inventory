import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    reportingApi,
    type ProductIdentity,
    type ReportFilters,
    type ReportOptions,
    type ReportResponse,
} from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, MetricCard, Panel } from '../../ui/primitives';

const emptyOptions: ReportOptions = { warehouses: [], reports: [] };
const emptyResponse: ReportResponse = {
    report: 'sales',
    data: [],
    meta: { current_page: 1, from: null, last_page: 1, per_page: 25, to: null, total: 0 },
    summary: {},
    rules: {},
};

function number(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
}
function money(value: number) {
    return `${number(value)} MMK`;
}
function message(error: unknown) {
    return error instanceof Error ? error.message : 'Unable to load report.';
}
export function ReportsPage() {
    const [options, setOptions] = useState(emptyOptions);
    const [response, setResponse] = useState(emptyResponse);
    const [filters, setFilters] = useState<ReportFilters>({ page: 1 });
    const [draft, setDraft] = useState<ReportFilters>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResponse(await reportingApi.report('sales', filters));
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        let active = true;
        void reportingApi
            .options()
            .then((value) => active && setOptions(value))
            .catch((error) => active && setError(message(error)));
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        setLoading(true);
        void reportingApi
            .report('sales', filters)
            .then((value) => {
                if (!active) return;
                setResponse(value);
                setError('');
            })
            .catch((requestError) => active && setError(message(requestError)))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [filters]);
    const apply = (event: FormEvent) => {
        event.preventDefault();
        setFilters({ ...draft, page: 1 });
    };
    const summaryKeys = ['month_sales', 'year_sales', 'gross_sales', 'units_sold'];

    return (
        <div className="admin-page reports-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Management intelligence</p>
                    <h1>Reports</h1>
                    <p>Analyse posted sales across your assigned locations.</p>
                </div>
                <div className="report-rule-note">
                    <Icon name="reports" size={16} />
                    <span>Financial totals include posted sales only.</span>
                </div>
            </header>

            <section aria-label="Report summary" className="metric-grid report-metrics">
                {summaryKeys
                    .filter((key) => key in response.summary)
                    .map((key) => (
                        <MetricCard
                            hint="Current filters"
                            icon={key.includes('unit') || key === 'products' ? 'box' : 'cash'}
                            key={key}
                            label={key.replaceAll('_', ' ')}
                            value={key.includes('sales') ? money(response.summary[key]) : number(response.summary[key])}
                        />
                    ))}
            </section>

            {error ? (
                <div className="ui-flash ui-flash--danger">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()}>Retry</button>
                </div>
            ) : null}

            <Panel eyebrow="Server-side report" title="Sales">
                <form className="filter-toolbar report-filters" onSubmit={apply}>
                    <div className="report-filter-scroll">
                        <div className="report-filter-fields">
                            <label className="filter-search">
                                <Icon name="search" size={15} />
                                <input
                                    aria-label="Search report"
                                    onChange={(event) =>
                                        setDraft((value) => ({ ...value, search: event.target.value }))
                                    }
                                    placeholder="Sale reference"
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
                            <select
                                aria-label="Status"
                                onChange={(event) =>
                                    setDraft((value) => ({ ...value, status: event.target.value || undefined }))
                                }
                                value={draft.status ?? ''}
                            >
                                <option value="">All statuses</option>
                                <option value="draft">Draft</option>
                                <option value="posted">Posted</option>
                                <option value="voided">Voided</option>
                            </select>
                            <DateFilter
                                label="From"
                                value={draft.date_from}
                                onChange={(date_from) => setDraft((value) => ({ ...value, date_from }))}
                            />
                            <DateFilter
                                label="To"
                                value={draft.date_to}
                                onChange={(date_to) => setDraft((value) => ({ ...value, date_to }))}
                            />
                        </div>
                    </div>
                    <Button icon="search" type="submit">
                        Apply
                    </Button>
                </form>

                {loading ? (
                    <div className="ui-loading">
                        <span />
                        Loading sales…
                    </div>
                ) : (
                    <SalesAnalysisChart
                        month={response.analysis?.month_trend ?? []}
                        products={response.analysis?.top_products ?? []}
                        year={response.analysis?.year_trend ?? []}
                    />
                )}
            </Panel>
        </div>
    );
}

function DateFilter({
    label,
    onChange,
    value,
}: {
    label: string;
    onChange: (value: string | undefined) => void;
    value?: string;
}) {
    return (
        <label className="report-date">
            <span>{label}</span>
            <input
                aria-label={`Date ${label.toLowerCase()}`}
                onChange={(event) => onChange(event.target.value || undefined)}
                type="date"
                value={value ?? ''}
            />
        </label>
    );
}

function SalesAnalysisChart({
    month,
    products,
    year,
}: {
    month: Array<{ amount: number; date: string; label: string }>;
    products: Array<{ amount: number; product: ProductIdentity; units: number }>;
    year: Array<{ amount: number; label: string; month: number }>;
}) {
    if (!month.length && !year.length && !products.length)
        return (
            <EmptyState
                description="Adjust the date or warehouse filters to analyse posted sales."
                title="No posted sales"
            />
        );
    const maximumUnits = Math.max(...products.map((row) => row.units), 1);
    return (
        <section aria-label="Posted sales analysis" className="report-sales-analysis-grid">
            <ChartCard eyebrow="Current month" title="Sales by day">
                <VerticalSalesChart ariaLabel="Current month sales by day" points={month} />
            </ChartCard>
            <ChartCard eyebrow="Current year" title="Sales by month">
                <VerticalSalesChart ariaLabel="Current year sales by month" points={year} />
            </ChartCard>
            <div className="report-chart-card">
                <header>
                    <p className="ui-eyebrow">Product ranking</p>
                    <h3>Top-selling products</h3>
                </header>
                <div className="report-top-products" role="img" aria-label="Top-selling products by units sold">
                    {products.map((row) => (
                        <div
                            key={row.product.id}
                            title={`${row.product.name}: ${row.units} ${row.product.unit} · ${money(row.amount)}`}
                        >
                            <span>
                                <strong>{row.product.name}</strong>
                                <small>
                                    {row.product.sku} · {row.units} {row.product.unit}
                                </small>
                            </span>
                            <i>
                                <b style={{ width: `${(row.units / maximumUnits) * 100}%` }} />
                            </i>
                            <em>{money(row.amount)}</em>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function ChartCard({ children, eyebrow, title }: { children: React.ReactNode; eyebrow: string; title: string }) {
    return (
        <div className="report-chart-card">
            <header>
                <p className="ui-eyebrow">{eyebrow}</p>
                <h3>{title}</h3>
            </header>
            {children}
        </div>
    );
}
function VerticalSalesChart({
    ariaLabel,
    points,
}: {
    ariaLabel: string;
    points: Array<{ amount: number; label: string }>;
}) {
    const maximum = Math.max(...points.map((point) => point.amount), 1);
    return (
        <div className="report-vertical-chart" role="img" aria-label={ariaLabel}>
            {points.map((point, index) => (
                <div
                    className="report-vertical-chart__item"
                    key={`${point.label}-${index}`}
                    title={`${point.label}: ${money(point.amount)}`}
                >
                    <div className="report-vertical-chart__track">
                        <span
                            style={{ height: `${Math.max(point.amount ? 4 : 0, (point.amount / maximum) * 100)}%` }}
                        />
                    </div>
                    <small>{point.label}</small>
                </div>
            ))}
        </div>
    );
}
