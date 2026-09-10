import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
    reportingApi,
    type Identity,
    type ProductIdentity,
    type ReportFilters,
    type ReportName,
    type ReportOptions,
    type ReportResponse,
} from '../../services/reporting';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, MetricCard, Pagination, Panel } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';
import { formatSellingUnitEquivalent, type SellingEquivalentProduct } from '../../ui/selling-unit-equivalent';

type TripReportRow = { product: ProductIdentity & SellingEquivalentProduct; quantity: number; net_amount: number };

const emptyOptions: ReportOptions = { warehouses: [], reports: [] };
const emptyResponse = (report: ReportName): ReportResponse => ({
    report,
    data: [],
    meta: { current_page: 1, from: null, last_page: 1, per_page: 25, to: null, total: 0 },
    summary: {},
    rules: {},
});
const errorMessage = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function ReportsPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    const [report, setReport] = useState<ReportName>('sales');
    const [options, setOptions] = useState(emptyOptions);
    const [response, setResponse] = useState(emptyResponse('sales'));
    const [filters, setFilters] = useState<ReportFilters>({ page: 1 });
    const [draft, setDraft] = useState<ReportFilters>({});
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            setResponse(await reportingApi.report(report, filters));
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to load report.')));
        } finally {
            setLoading(false);
        }
    }, [filters, report, t]);
    useEffect(() => {
        let active = true;
        void reportingApi
            .options()
            .then((value) => active && setOptions(value))
            .catch((requestError) => active && setError(errorMessage(requestError, t('Unable to load report.'))));
        return () => {
            active = false;
        };
    }, [t]);
    useEffect(() => {
        // The selected report and applied filters intentionally drive this server request.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void load();
    }, [load]);

    const titles: Record<ReportName, string> = {
        sales: t('Sales analysis'),
        representatives: t('Representative analysis'),
        customers: t('Customer analysis'),
        trip: t('Trip'),
    };
    const descriptions: Record<ReportName, string> = {
        sales: t('Analyse posted sales across your assigned locations.'),
        representatives: t('Compare representative sales power across warehouses and durations.'),
        customers: t('Compare customer purchase power for a selected duration.'),
        trip: t('Posted trip sales grouped by product. Quantities exclude FOC; net amounts include item discounts and item promotions. Invoice-level cashback is reflected only in invoice totals.'),
    };
    const metrics =
        report === 'sales'
            ? ['month_sales', 'year_sales', 'gross_sales', 'units_sold']
            : report === 'representatives'
              ? ['representatives', 'sales_amount', 'transactions']
              : ['customers', 'purchase_amount', 'transactions'];
    const apply = (event: FormEvent) => {
        event.preventDefault();
        setFilters({ ...draft, page: 1 });
    };
    const selectReport = (next: ReportName) => {
        setReport(next);
        setDraft({});
        setFilters({ page: 1 });
        setResponse(emptyResponse(next));
    };
    const exportCsv = async () => {
        setExporting(true);
        setError('');
        try {
            const first = await reportingApi.report(report, { ...filters, page: 1 }, 100);
            const rows = [...first.data];
            for (let page = 2; page <= first.meta.last_page; page += 1)
                rows.push(...(await reportingApi.report(report, { ...filters, page }, 100)).data);
            downloadCsv(`${report}-analysis.csv`, csvRows(report, rows, t));
        } catch (requestError) {
            setError(errorMessage(requestError, t('Unable to export report.')));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="admin-page reports-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">{t('Management intelligence')}</p>
                    <h1>{titles[report]}</h1>
                    <p>{descriptions[report]}</p>
                </div>
                <div className="report-rule-note">
                    <Icon name="reports" size={16} />
                    <span>{t('Financial totals include posted sales only.')}</span>
                </div>
            </header>
            <nav
                aria-label={t('Report sections')}
                className="section-tabs section-tabs--4 report-tabs reports-page-tabs"
                role="tablist"
            >
                {(['sales', 'representatives', 'customers', 'trip'] as ReportName[]).map((name) => (
                    <button
                        aria-selected={report === name}
                        key={name}
                        onClick={() => selectReport(name)}
                        role="tab"
                        type="button"
                    >
                        <Icon name={name === 'sales' ? 'reports' : 'customers'} size={16} />
                        {titles[name]}
                    </button>
                ))}
            </nav>
            <section aria-label={t('Analysis summary')} className="metric-grid report-metrics">
                {metrics
                    .filter((key) => key in response.summary)
                    .map((key) => (
                        <MetricCard
                            hint={t('Current filters')}
                            icon={key.includes('unit') ? 'box' : 'cash'}
                            key={key}
                            label={t(key.replaceAll('_', ' '))}
                            value={
                                key.includes('sales') || key.includes('purchase') || key.includes('amount')
                                    ? money(response.summary[key])
                                    : formatNumber(response.summary[key])
                            }
                        />
                    ))}
            </section>
            {error ? (
                <div className="ui-flash ui-flash--danger" role="alert">
                    <Icon name="x" size={15} />
                    {error}
                    <button onClick={() => void load()} type="button">
                        {t('Retry')}
                    </button>
                </div>
            ) : null}
            <Panel eyebrow={t('Server-side report')} title={titles[report]}>
                <form className="filter-toolbar report-filters" onSubmit={apply}>
                    <div className="report-filter-scroll">
                        <div className="report-filter-fields">
                            {report === 'sales' ? (
                                <label className="filter-search">
                                    <Icon name="search" size={15} />
                                    <input
                                        aria-label={t('Search report')}
                                        onChange={(event) =>
                                            setDraft((value) => ({ ...value, search: event.target.value }))
                                        }
                                        placeholder={t('Sale reference')}
                                        type="search"
                                        value={draft.search ?? ''}
                                    />
                                </label>
                            ) : null}
                            {report !== 'customers' ? (
                                <select
                                    aria-label={t('Warehouse')}
                                    onChange={(event) =>
                                        setDraft((value) => ({
                                            ...value,
                                            warehouse_id: Number(event.target.value) || undefined,
                                            region_id: undefined,
                                            representative_id: undefined,
                                        }))
                                    }
                                    value={draft.warehouse_id ?? 0}
                                >
                                    <option value={0}>{t('All warehouses')}</option>
                                    {options.warehouses.map((warehouse) => (
                                        <option key={warehouse.id} value={warehouse.id}>
                                            {warehouse.code} · {warehouse.name}
                                        </option>
                                    ))}
                                </select>
                            ) : null}
                            {report === 'trip' ? <>
                                <select aria-label={t('Region')} value={draft.region_id ?? 0} onChange={(event) => setDraft((value) => ({ ...value, region_id: Number(event.target.value) || undefined, representative_id: undefined }))}>
                                    <option value={0}>{t('All regions')}</option>
                                    {(options.regions ?? []).filter((item) => !draft.warehouse_id || item.warehouse_id === draft.warehouse_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                                </select>
                                <select aria-label={t('Sales representative')} value={draft.representative_id ?? 0} onChange={(event) => setDraft((value) => ({ ...value, representative_id: Number(event.target.value) || undefined }))}>
                                    <option value={0}>{t('All representatives')}</option>
                                    {(options.representatives ?? []).filter((item) => (!draft.warehouse_id || item.primary_warehouse_id === draft.warehouse_id) && (!draft.region_id || item.regions.some((region) => region.id === draft.region_id))).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
                                </select>
                            </> : null}
                            {report === 'sales' ? (
                                <select
                                    aria-label={t('Status')}
                                    onChange={(event) =>
                                        setDraft((value) => ({ ...value, status: event.target.value || undefined }))
                                    }
                                    value={draft.status ?? ''}
                                >
                                    <option value="">{t('All statuses')}</option>
                                    <option value="draft">{t('Draft')}</option>
                                    <option value="posted">{t('Posted')}</option>
                                    <option value="voided">{t('Voided')}</option>
                                </select>
                            ) : null}
                            <DateFilter
                                ariaLabel={t('Date from')}
                                label={t('From')}
                                onChange={(date_from) => setDraft((value) => ({ ...value, date_from }))}
                                value={draft.date_from}
                            />
                            <DateFilter
                                ariaLabel={t('Date to')}
                                label={t('To')}
                                onChange={(date_to) => setDraft((value) => ({ ...value, date_to }))}
                                value={draft.date_to}
                            />
                            {report !== 'sales' && report !== 'trip' ? (
                                <label className="report-amount">
                                    <span>
                                        {report === 'representatives'
                                            ? t('Minimum sales amount')
                                            : t('Minimum purchase amount')}
                                    </span>
                                    <input
                                        min="0"
                                        onChange={(event) =>
                                            setDraft((value) => ({
                                                ...value,
                                                min_amount: Number(event.target.value) || undefined,
                                            }))
                                        }
                                        placeholder="0"
                                        type="number"
                                        value={draft.min_amount ?? ''}
                                    />
                                </label>
                            ) : null}
                        </div>
                    </div>
                    <div className="report-filter-action">
                        <Button icon="search" type="submit">
                            {t('Apply')}
                        </Button>
                        {report !== 'sales' ? (
                            <Button
                                disabled={exporting || loading}
                                icon="download"
                                onClick={() => void exportCsv()}
                                tone="secondary"
                                type="button"
                            >
                                {exporting ? t('Exporting…') : t('Export CSV')}
                            </Button>
                        ) : null}
                    </div>
                </form>
                {loading ? (
                    <div className="ui-loading" role="status">
                        <span />
                        {t('Loading analysis…')}
                    </div>
                ) : report === 'sales' ? (
                    <SalesAnalysisChart
                        month={response.analysis?.month_trend ?? []}
                        products={response.analysis?.top_products ?? []}
                        year={response.analysis?.year_trend ?? []}
                    />
                ) : report === 'trip' ? (
                    response.data.length === 0 ? <EmptyState title={t('No sales found')} description={t('Adjust the date or warehouse filters to analyse posted sales.')} /> :
                    <div className="ui-table-wrap"><table className="ui-table"><thead><tr><th>{t('Product')}</th><th className="is-numeric">{t('Quantity')}</th><th className="is-numeric">{t('Net amount')}</th></tr></thead><tbody>
                        {(response.data as TripReportRow[]).map((row) => <tr key={row.product.id}><td><strong>{row.product.name}</strong><small>{row.product.sku}</small></td><td className="is-numeric">{formatSellingUnitEquivalent(row.quantity, row.product, formatNumber)}</td><td className="is-numeric">{money(row.net_amount)}</td></tr>)}
                    </tbody></table></div>
                ) : (
                    <AnalysisTable dateTime={formatDateTime} money={money} report={report} rows={response.data} t={t} />
                )}
                {report !== 'sales' ? (
                    <Pagination
                        label={titles[report]}
                        loading={loading}
                        meta={response.meta}
                        onPageChange={(page) => setFilters((value) => ({ ...value, page }))}
                    />
                ) : null}
            </Panel>
        </div>
    );
}

function DateFilter({
    ariaLabel,
    label,
    onChange,
    value,
}: {
    ariaLabel: string;
    label: string;
    onChange: (value: string | undefined) => void;
    value?: string;
}) {
    return (
        <label className="report-date">
            <span>{label}</span>
            <input
                aria-label={ariaLabel}
                onChange={(event) => onChange(event.target.value || undefined)}
                type="date"
                value={value ?? ''}
            />
        </label>
    );
}
type AnalysisRow = {
    representative?: Identity;
    customer?: Identity;
    warehouse: Identity;
    sale_count?: number;
    customer_count?: number;
    sales_amount?: number;
    purchase_count?: number;
    purchase_amount?: number;
    last_purchase_at?: string | null;
};
function AnalysisTable({
    dateTime,
    money,
    report,
    rows,
    t,
}: {
    dateTime: (value: string) => string;
    money: (value: number) => string;
    report: Exclude<ReportName, 'sales' | 'trip'>;
    rows: Record<string, unknown>[];
    t: (key: string) => string;
}) {
    if (!rows.length)
        return (
            <EmptyState
                description={t('Adjust the duration or minimum amount filters.')}
                title={t('No analysis results')}
            />
        );
    return (
        <div className="ui-table-wrap">
            <table className="ui-table report-table report-analysis-table">
                <thead>
                    <tr>
                        <th>{report === 'representatives' ? t('Representative') : t('Customer')}</th>
                        <th>{t('Warehouse')}</th>
                        <th>{t('Transactions')}</th>
                        {report === 'representatives' ? <th>{t('Customers')}</th> : <th>{t('Last purchase')}</th>}
                        <th>{report === 'representatives' ? t('Sales amount') : t('Purchase amount')}</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows as AnalysisRow[]).map((row) => {
                        const identity = report === 'representatives' ? row.representative! : row.customer!;
                        return (
                            <tr key={`${identity.id}-${row.warehouse.id}`}>
                                <td>
                                    <strong>{identity.name}</strong>
                                    <small>{identity.code}</small>
                                </td>
                                <td>
                                    <strong>{row.warehouse.name}</strong>
                                    <small>{row.warehouse.code}</small>
                                </td>
                                <td>{report === 'representatives' ? row.sale_count : row.purchase_count}</td>
                                <td>
                                    {report === 'representatives'
                                        ? row.customer_count
                                        : row.last_purchase_at
                                          ? dateTime(row.last_purchase_at)
                                          : '—'}
                                </td>
                                <td>
                                    <strong>
                                        {money(
                                            report === 'representatives'
                                                ? (row.sales_amount ?? 0)
                                                : (row.purchase_amount ?? 0),
                                        )}
                                    </strong>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
function csvRows(
    report: ReportName,
    rows: Record<string, unknown>[],
    t: (key: string) => string,
): Array<Array<string | number>> {
    if (report === 'trip') return [
        [t('Product'), t('Quantity'), t('Net amount')],
        ...(rows as TripReportRow[]).map((row) => [row.product.name, formatSellingUnitEquivalent(row.quantity, row.product, String), row.net_amount]),
    ];
    if (report === 'representatives')
        return [
            [
                t('Representative code'),
                t('Representative'),
                t('Warehouse code'),
                t('Warehouse'),
                t('Transactions'),
                t('Customers'),
                t('Sales amount'),
            ],
            ...(rows as AnalysisRow[]).map((row) => [
                row.representative!.code,
                row.representative!.name,
                row.warehouse.code,
                row.warehouse.name,
                row.sale_count ?? 0,
                row.customer_count ?? 0,
                row.sales_amount ?? 0,
            ]),
        ];
    return [
        [
            t('Customer code'),
            t('Customer'),
            t('Warehouse code'),
            t('Warehouse'),
            t('Transactions'),
            t('Last purchase'),
            t('Purchase amount'),
        ],
        ...(rows as AnalysisRow[]).map((row) => [
            row.customer!.code,
            row.customer!.name,
            row.warehouse.code,
            row.warehouse.name,
            row.purchase_count ?? 0,
            row.last_purchase_at ?? '',
            row.purchase_amount ?? 0,
        ]),
    ];
}
function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
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
    const { formatNumber, t } = useLocale();
    const money = (value: number) => `${formatNumber(value)} MMK`;
    if (!month.length && !year.length && !products.length)
        return (
            <EmptyState
                description={t('Adjust the date or warehouse filters to analyse posted sales.')}
                title={t('No posted sales')}
            />
        );
    const maximumUnits = Math.max(...products.map((row) => row.units), 1);
    return (
        <section aria-label={t('Posted sales analysis')} className="report-sales-analysis-grid">
            <ChartCard eyebrow={t('Current month')} title={t('Sales by day')}>
                <VerticalSalesChart ariaLabel={t('Current month sales by day')} points={month} />
            </ChartCard>
            <ChartCard eyebrow={t('Current year')} title={t('Sales by month')}>
                <VerticalSalesChart ariaLabel={t('Current year sales by month')} points={year} />
            </ChartCard>
            <div className="report-chart-card">
                <header>
                    <p className="ui-eyebrow">{t('Product ranking')}</p>
                    <h3>{t('Top-selling products')}</h3>
                </header>
                <div className="report-top-products" role="img" aria-label={t('Top-selling products by units sold')}>
                    {products.map((row) => (
                        <div
                            key={row.product.id}
                            title={`${row.product.name}: ${formatNumber(row.units)} ${row.product.unit} · ${money(row.amount)}`}
                        >
                            <span>
                                <strong>{row.product.name}</strong>
                                <small>
                                    {row.product.sku} · {formatNumber(row.units)} {row.product.unit}
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
function ChartCard({ children, eyebrow, title }: { children: ReactNode; eyebrow: string; title: string }) {
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
    const { formatNumber } = useLocale();
    const maximum = Math.max(...points.map((point) => point.amount), 1);
    return (
        <div className="report-vertical-chart" role="img" aria-label={ariaLabel}>
            {points.map((point, index) => (
                <div
                    className="report-vertical-chart__item"
                    key={`${point.label}-${index}`}
                    title={`${point.label}: ${formatNumber(point.amount)} MMK`}
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
