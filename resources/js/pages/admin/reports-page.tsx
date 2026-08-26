import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
    reportingApi,
    type ProductIdentity,
    type ReportFilters,
    type ReportOptions,
    type ReportResponse,
    type ReportName,
} from '../../services/reporting';
import { Icon, type IconName } from '../../ui/icons';
import { Button, EmptyState, MetricCard, Pagination, Panel } from '../../ui/primitives';

const emptyOptions: ReportOptions = {
    warehouses: [],
    reports: [],
    regions: [],
    ways: [],
    representatives: [],
    products: [],
};
const emptyResponse: ReportResponse = {
    report: 'sales',
    data: [],
    meta: { current_page: 1, from: null, last_page: 1, per_page: 25, to: null, total: 0 },
    summary: {},
    rules: {},
};
const reportTabs: Array<{ icon: IconName; label: string; value: ReportName }> = [
    { icon: 'sales', label: 'Sales analysis', value: 'sales' },
    { icon: 'truck', label: 'Way sales power', value: 'way-sales-power' },
    { icon: 'transfer', label: 'Stock issues', value: 'stock-issues' },
];

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
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [reportName, setReportName] = useState<ReportName>('sales');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResponse(await reportingApi.report(reportName, filters));
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setLoading(false);
        }
    }, [filters, reportName]);

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
        void reportingApi
            .report(reportName, filters)
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
    }, [filters, reportName]);
    const apply = (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setFilters({ ...draft, page: 1 });
    };
    const switchReport = (nextReport: ReportName) => {
        if (nextReport === reportName) return;
        setLoading(true);
        setError('');
        setReportName(nextReport);
        setResponse({ ...emptyResponse, report: nextReport });
        setFilters({ page: 1 });
        setDraft({});
    };
    const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [],
        );
        const currentIndex = tabs.indexOf(event.currentTarget);
        const nextIndex =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[nextIndex]?.focus();
        tabs[nextIndex]?.click();
    };
    const exportCurrentReport = async () => {
        setExporting(true);
        setError('');
        try {
            const { blob, filename } =
                reportName === 'stock-issues'
                    ? await reportingApi.exportStockIssues(filters)
                    : await reportingApi.exportWaySalesPower(filters);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (requestError) {
            setError(message(requestError));
        } finally {
            setExporting(false);
        }
    };
    const summaryKeys =
        reportName === 'sales'
            ? ['month_sales', 'year_sales', 'gross_sales', 'units_sold']
            : reportName === 'way-sales-power'
              ? ['gross_sales', 'invoices', 'customers', 'paid_base_units', 'foc_base_units']
              : ['total_issued_units', 'products', 'issues', 'foc_base_units'];

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

            <div aria-label="Report sections" className="section-tabs section-tabs--3 reports-page-tabs" role="tablist">
                {reportTabs.map((tab) => (
                    <button
                        aria-controls="report-panel"
                        aria-selected={reportName === tab.value}
                        id={`report-tab-${tab.value}`}
                        key={tab.value}
                        onClick={() => switchReport(tab.value)}
                        onKeyDown={navigateTabs}
                        role="tab"
                        tabIndex={reportName === tab.value ? 0 : -1}
                        type="button"
                    >
                        <Icon name={tab.icon} size={15} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div
                aria-labelledby={`report-tab-${reportName}`}
                className="report-tab-panel"
                id="report-panel"
                role="tabpanel"
            >
                <section
                    aria-label={`${reportTabs.find((tab) => tab.value === reportName)?.label} summary`}
                    className="metric-grid report-metrics"
                >
                    {summaryKeys
                        .filter((key) => key in response.summary)
                        .map((key) => (
                            <MetricCard
                                hint="Current filters"
                                icon={
                                    key.includes('unit') || key === 'products'
                                        ? 'box'
                                        : key === 'representatives'
                                          ? 'users'
                                          : key === 'issues'
                                            ? 'transfer'
                                            : 'cash'
                                }
                                key={key}
                                label={key.replaceAll('_', ' ')}
                                value={
                                    key.includes('sales') ? money(response.summary[key]) : number(response.summary[key])
                                }
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

                <Panel
                    actions={
                        reportName !== 'sales' ? (
                            <Button
                                disabled={loading || exporting || response.meta.total === 0}
                                icon="download"
                                onClick={() => void exportCurrentReport()}
                                requiresOnline
                            >
                                {exporting ? 'Exporting…' : 'Export CSV'}
                            </Button>
                        ) : null
                    }
                    eyebrow="Server-side report"
                    title={reportTabs.find((tab) => tab.value === reportName)?.label ?? 'Report'}
                >
                    <form className="filter-toolbar report-filters" onSubmit={apply}>
                        <div className="report-filter-scroll">
                            <div className="report-filter-fields">
                                {reportName === 'sales' ? (
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
                                ) : null}
                                <select
                                    aria-label="Warehouse"
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            warehouse_id: Number(event.target.value) || undefined,
                                            ...(reportName !== 'sales'
                                                ? { region_id: undefined, way_id: undefined }
                                                : {}),
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
                                {reportName !== 'sales' ? (
                                    <>
                                        <select
                                            aria-label="Region"
                                            onChange={(event) =>
                                                setDraft((value) => ({
                                                    ...value,
                                                    region_id: Number(event.target.value) || undefined,
                                                    way_id: undefined,
                                                }))
                                            }
                                            value={draft.region_id ?? 0}
                                        >
                                            <option value={0}>All regions</option>
                                            {options.regions
                                                .filter(
                                                    (row) =>
                                                        !draft.warehouse_id || row.warehouse_id === draft.warehouse_id,
                                                )
                                                .map((row) => (
                                                    <option key={row.id} value={row.id}>
                                                        {row.name}
                                                    </option>
                                                ))}
                                        </select>
                                        <select
                                            aria-label="Way"
                                            onChange={(event) =>
                                                setDraft((value) => ({
                                                    ...value,
                                                    way_id: Number(event.target.value) || undefined,
                                                }))
                                            }
                                            value={draft.way_id ?? 0}
                                        >
                                            <option value={0}>All Ways</option>
                                            {options.ways
                                                .filter((row) => {
                                                    if (draft.region_id) return row.region_id === draft.region_id;
                                                    if (!draft.warehouse_id) return true;
                                                    return options.regions.some(
                                                        (region) =>
                                                            region.id === row.region_id &&
                                                            region.warehouse_id === draft.warehouse_id,
                                                    );
                                                })
                                                .map((row) => (
                                                    <option key={row.id} value={row.id}>
                                                        {row.code} · {row.name}
                                                    </option>
                                                ))}
                                        </select>
                                    </>
                                ) : null}
                                {reportName === 'sales' ? (
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
                                ) : null}
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
                        <div className="report-filter-action">
                            <Button icon="search" type="submit">
                                Apply
                            </Button>
                        </div>
                    </form>

                    {loading ? (
                        <div className="ui-loading">
                            <span />
                            Loading {reportTabs.find((tab) => tab.value === reportName)?.label.toLowerCase()}…
                        </div>
                    ) : reportName === 'sales' ? (
                        <SalesAnalysisChart
                            month={response.analysis?.month_trend ?? []}
                            products={response.analysis?.top_products ?? []}
                            year={response.analysis?.year_trend ?? []}
                        />
                    ) : (
                        <>
                            {reportName === 'way-sales-power' ? (
                                <WayPowerTable rows={response.data} />
                            ) : (
                                <StockIssueTable rows={response.data} />
                            )}
                            <Pagination
                                label={reportName === 'way-sales-power' ? 'Way sales power' : 'Stock issues'}
                                loading={loading}
                                meta={response.meta}
                                onPageChange={(page) => {
                                    setLoading(true);
                                    setFilters((value) => ({ ...value, page }));
                                }}
                            />
                        </>
                    )}
                </Panel>
            </div>
        </div>
    );
}

function StockIssueTable({ rows }: { rows: Array<Record<string, unknown>> }) {
    if (!rows.length)
        return (
            <EmptyState
                description="Adjust the Warehouse, Region, Way, or date filters."
                title="No dispatched stock issues"
            />
        );
    return (
        <div className="ui-table-wrap">
            <table className="ui-table report-table">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th>Base unit</th>
                        <th className="is-numeric">Paid base</th>
                        <th className="is-numeric">FOC base</th>
                        <th className="is-numeric">Total issued</th>
                        <th className="is-numeric">Issue count</th>
                        <th className="is-numeric">Representatives</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => {
                        const product = row.product as { id: number; name: string; sku: string; unit: string };
                        return (
                            <tr key={product.id}>
                                <td>
                                    <strong>{product.name}</strong>
                                    <small>{product.sku}</small>
                                </td>
                                <td>{product.unit}</td>
                                <td className="is-numeric">{number(Number(row.paid_base_units ?? 0))}</td>
                                <td className="is-numeric">{number(Number(row.foc_base_units ?? 0))}</td>
                                <td className="is-numeric">
                                    <strong>{number(Number(row.total_issued_units ?? 0))}</strong>
                                </td>
                                <td className="is-numeric">{number(Number(row.issues ?? 0))}</td>
                                <td className="is-numeric">{number(Number(row.representatives ?? 0))}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function WayPowerTable({ rows }: { rows: Array<Record<string, unknown>> }) {
    if (!rows.length)
        return (
            <EmptyState
                description="Adjust the Warehouse, Region, Way, status, or date filters."
                title="No posted Way sales"
            />
        );
    return (
        <div className="ui-table-wrap">
            <table className="ui-table">
                <thead>
                    <tr>
                        <th>Way</th>
                        <th>Region</th>
                        <th>Representative</th>
                        <th className="is-numeric">Sales</th>
                        <th className="is-numeric">Paid base</th>
                        <th className="is-numeric">FOC base</th>
                        <th className="is-numeric">Invoices</th>
                        <th className="is-numeric">Customers</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, index) => {
                        const way = row.way as { code: string; name: string };
                        const region = row.region as { name: string };
                        const representative = row.representative as { code: string; name: string };
                        return (
                            <tr key={`${way.code}-${representative.code}-${index}`}>
                                <td>
                                    <strong>{way.name}</strong>
                                    <small>{way.code}</small>
                                </td>
                                <td>{region.name}</td>
                                <td>
                                    <strong>{representative.name}</strong>
                                    <small>{representative.code}</small>
                                </td>
                                <td className="is-numeric">
                                    <strong>{money(Number(row.sales_amount ?? 0))}</strong>
                                </td>
                                <td className="is-numeric">{number(Number(row.paid_base_units ?? 0))}</td>
                                <td className="is-numeric">{number(Number(row.foc_base_units ?? 0))}</td>
                                <td className="is-numeric">{number(Number(row.invoices ?? 0))}</td>
                                <td className="is-numeric">{number(Number(row.customers ?? 0))}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
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
