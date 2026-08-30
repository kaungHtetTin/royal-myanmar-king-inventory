import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../auth/session-context';
import type { PaginationMeta } from '../../services/administration';
import { tripApi, TripApiError, type Trip, type TripInput, type TripOptions, type TripStatus } from '../../services/trips';
import { Button, Dialog, EmptyState, IconLink, MetricCard, Pagination, Panel, StatusBadge } from '../../ui/primitives';
import { Icon } from '../../ui/icons';
import { useLocale } from '../../localization/locale-context';
import { useBranding } from '../../branding/branding-context';
import { printInvoicesA5 } from '../../services/invoice-print';

const emptyMeta: PaginationMeta = { current_page: 1, from: null, last_page: 1, per_page: 20, to: null, total: 0 };
const emptyOptions: TripOptions = { warehouses: [], regions: [], representatives: [], vehicles: [] };
const emptyInput: TripInput = { title: '', warehouse_id: 0, region_id: 0, sales_representative_id: 0, vehicle_id: 0, notes: '' };
const statusTone = (status: TripStatus) => status === 'operation' ? 'success' : status === 'planning' ? 'warning' : status === 'ending' ? 'info' : status === 'cancelled' ? 'danger' : 'neutral';
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function TripManagementPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const { user } = useSession();
    const canManage = Boolean(user?.roles.includes('super-admin') || user?.permissions.includes('trip.manage'));
    const [rows, setRows] = useState<Trip[]>([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [summary, setSummary] = useState({ total: 0, planning: 0, operation: 0, ending: 0 });
    const [options, setOptions] = useState(emptyOptions);
    const [filters, setFilters] = useState({ page: 1, status: '', search: '', date_from: '', date_to: '' });
    const [draft, setDraft] = useState({ status: '', search: '', date_from: '', date_to: '' });
    const [form, setForm] = useState(emptyInput);
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [dialogOpen, setDialogOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [response, available] = await Promise.all([tripApi.list(filters), tripApi.options()]);
            setRows(response.data); setMeta(response.meta); setSummary(response.summary); setOptions(available); setError('');
        } catch (requestError) { setError(errorMessage(requestError, t('Unable to load trips.'))); }
        finally { setLoading(false); }
    }, [filters, t]);
    // The callback also powers retry and pagination; invoking it is the single loading-state transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);

    const regions = options.regions.filter((region) => region.warehouse_id === form.warehouse_id);
    const representatives = options.representatives.filter((representative) => representative.primary_warehouse_id === form.warehouse_id && (!form.region_id || representative.regions.some((region) => region.id === form.region_id)));
    const vehicles = options.vehicles.filter((vehicle) => !vehicle.sales_representative_id || !form.sales_representative_id || vehicle.sales_representative_id === form.sales_representative_id);
    const openCreate = () => {
        setForm(emptyInput);
        setErrors({}); setDialogOpen(true);
    };
    const create = async () => {
        setSaving(true); setErrors({});
        try { await tripApi.create(form); setDialogOpen(false); await load(); }
        catch (requestError) { setErrors(requestError instanceof TripApiError ? requestError.fields : {}); setError(errorMessage(requestError, t('Unable to create trip.'))); }
        finally { setSaving(false); }
    };
    return <div className="admin-page trip-management-page">
        <header className="page-heading"><div><p className="ui-eyebrow">{t('Field operations')}</p><h1>{t('Trips')}</h1><p>{t('Plan stock, selling, expenses, returns, and cash handover in one operational record.')}</p></div>{canManage ? <Button icon="plus" onClick={openCreate} tone="primary">{t('Plan trip')}</Button> : null}</header>
        <div className="metric-grid access-metrics">
            <MetricCard hint={t('All matching records')} icon="truck" label={t('Trips')} value={formatNumber(summary.total)} />
            <MetricCard hint={t('Preparing stock and assignment')} icon="adjustments" label={t('Planning')} value={formatNumber(summary.planning)} />
            <MetricCard hint={t('Representatives currently selling')} icon="sales" label={t('Operation')} value={formatNumber(summary.operation)} />
            <MetricCard hint={t('Returning stock and cash')} icon="reverse" label={t('Ending')} value={formatNumber(summary.ending)} />
        </div>
        {error ? <div className="ui-flash ui-flash--danger" role="alert">{error}<button onClick={() => void load()}>{t('Retry')}</button></div> : null}
        <Panel eyebrow={t('Trip register')} title={t('Planned and active trips')}>
            <form className="filter-toolbar trip-filters" onSubmit={(event: FormEvent) => { event.preventDefault(); setFilters({ ...draft, page: 1 }); }}>
                <label className="filter-search"><input aria-label={t('Search trips')} onChange={(event) => setDraft({ ...draft, search: event.target.value })} placeholder={t('Reference or title')} value={draft.search} /></label>
                <label className="filter-field"><span>{t('Status')}</span><select onChange={(event) => setDraft({ ...draft, status: event.target.value })} value={draft.status}><option value="">{t('All statuses')}</option>{['planning','operation','ending','completed','cancelled'].map((status) => <option key={status} value={status}>{t(status)}</option>)}</select></label>
                <label className="filter-field"><span>{t('From')}</span><input max={draft.date_to || undefined} onChange={(event) => setDraft({ ...draft, date_from: event.target.value })} type="date" value={draft.date_from} /></label>
                <label className="filter-field"><span>{t('To')}</span><input min={draft.date_from || undefined} onChange={(event) => setDraft({ ...draft, date_to: event.target.value })} type="date" value={draft.date_to} /></label>
                <Button icon="search" type="submit">{t('Apply')}</Button>
            </form>
            <div className="ui-table-wrap"><table className="ui-table trip-table"><thead><tr><th>{t('Trip')}</th><th>{t('Representative')}</th><th>{t('Coverage')}</th><th>{t('Vehicle')}</th><th>{t('Status')}</th><th>{t('Created')}</th><th className="ui-table__actions"><span className="sr-only">{t('Actions')}</span></th></tr></thead><tbody>
                {!loading && rows.length === 0 ? <tr><td colSpan={7}><EmptyState title={t('No trips found')} description={t('Plan a trip to begin controlled field operations.')} /></td></tr> : rows.map((trip) => <tr key={trip.id}><td><strong>{trip.title}</strong><small>{trip.reference}</small></td><td><strong>{trip.representative.name}</strong><small>{trip.representative.code}</small></td><td><strong>{trip.region.name}</strong><small>{trip.warehouse.name}</small></td><td><strong>{trip.vehicle.vehicle_number}</strong><small>{trip.vehicle.vehicle_type}</small></td><td><StatusBadge tone={statusTone(trip.status)}>{t(trip.status)}</StatusBadge></td><td>{formatDateTime(trip.created_at)}</td><td className="ui-table__actions"><IconLink icon="chevronRight" label={t('Open trip {reference}', { reference: trip.reference })} to={`/admin/trips/${trip.id}`} /></td></tr>)}</tbody></table></div>
            <Pagination label={t('Trip list')} loading={loading} meta={meta} onPageChange={(page) => setFilters({ ...filters, page })} />
        </Panel>
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={t('Plan a trip')} description={t('Set the coverage first, then assign the representative and vehicle.')} footer={<><Button onClick={() => setDialogOpen(false)}>{t('Cancel')}</Button><Button disabled={saving || !form.title.trim() || !form.warehouse_id || !form.region_id || !form.sales_representative_id || !form.vehicle_id} onClick={() => void create()} tone="primary">{saving ? t('Saving...') : t('Create trip')}</Button></>}>
            <div className="management-form trip-create-form">
                <section className="trip-create-section">
                    <div className="trip-create-section__heading"><span>1</span><div><strong>{t('Trip information')}</strong><small>{t('Give this trip a clear operational title.')}</small></div></div>
                    <label className="ui-field"><span>{t('Title')}</span><input autoFocus maxLength={150} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={t('Example: North region morning route')} value={form.title} />{errors.title?.[0] ? <small className="ui-field__error">{errors.title[0]}</small> : null}</label>
                </section>
                <section className="trip-create-section">
                    <div className="trip-create-section__heading"><span>2</span><div><strong>{t('Sales coverage')}</strong><small>{t('Choose in order: warehouse, region, then sales representative.')}</small></div></div>
                    <div className="trip-coverage-selectors">
                        <label className="ui-field"><span>{t('Warehouse')}</span><select onChange={(event) => setForm({ ...form, warehouse_id: Number(event.target.value), region_id: 0, sales_representative_id: 0, vehicle_id: 0 })} value={form.warehouse_id}><option value={0}>{t('Select warehouse')}</option>{options.warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>{errors.warehouse_id?.[0] ? <small className="ui-field__error">{errors.warehouse_id[0]}</small> : <small>{t('Stock will be issued from here.')}</small>}</label>
                        <label className="ui-field"><span>{t('Region')}</span><select disabled={!form.warehouse_id} onChange={(event) => setForm({ ...form, region_id: Number(event.target.value), sales_representative_id: 0, vehicle_id: 0 })} value={form.region_id}><option value={0}>{form.warehouse_id ? t('Select region') : t('Select warehouse first')}</option>{regions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{errors.region_id?.[0] ? <small className="ui-field__error">{errors.region_id[0]}</small> : <small>{t('Only regions in the warehouse are shown.')}</small>}</label>
                        <label className="ui-field"><span>{t('Sales representative')}</span><select disabled={!form.region_id} onChange={(event) => setForm({ ...form, sales_representative_id: Number(event.target.value), vehicle_id: 0 })} value={form.sales_representative_id}><option value={0}>{form.region_id ? t('Select representative') : t('Select region first')}</option>{representatives.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>{errors.sales_representative_id?.[0] ? <small className="ui-field__error">{errors.sales_representative_id[0]}</small> : <small>{t('Only representatives assigned to this region are shown.')}</small>}</label>
                    </div>
                </section>
                <section className="trip-create-section">
                    <div className="trip-create-section__heading"><span>3</span><div><strong>{t('Vehicle and notes')}</strong><small>{t('Complete the assignment before creating the trip.')}</small></div></div>
                    <div className="form-grid trip-create-assignment">
                        <label className="ui-field"><span>{t('Vehicle')}</span><select disabled={!form.sales_representative_id} onChange={(event) => setForm({ ...form, vehicle_id: Number(event.target.value) })} value={form.vehicle_id}><option value={0}>{form.sales_representative_id ? t('Select vehicle') : t('Select representative first')}</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.vehicle_number} · {item.vehicle_type}</option>)}</select>{errors.vehicle_id?.[0] ? <small className="ui-field__error">{errors.vehicle_id[0]}</small> : <small>{t('Unavailable vehicles are excluded.')}</small>}</label>
                        <label className="ui-field"><span>{t('Notes')} <small className="trip-create-optional">{t('Optional')}</small></span><textarea maxLength={2000} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder={t('Add instructions or operational context')} rows={3} value={form.notes} /></label>
                    </div>
                </section>
            </div>
        </Dialog>
    </div>;
}

type DetailTab = 'overview' | 'products' | 'sales' | 'stock' | 'expenses' | 'cash' | 'collections';
const detailTabIcons = {
    overview: 'dashboard',
    products: 'box',
    sales: 'sales',
    stock: 'transfer',
    expenses: 'reports',
    cash: 'cash',
    collections: 'customers',
} as const;
export function TripDetailPage() {
    const { tripId } = useParams(); const navigate = useNavigate();
    const { formatDateTime, formatNumber, locale, t } = useLocale(); const money = (value = 0) => `${formatNumber(value)} MMK`;
    const { branding } = useBranding();
    const { user } = useSession(); const superAdmin = user?.roles.includes('super-admin');
    const canManage = Boolean(superAdmin || user?.permissions.includes('trip.manage')); const canClose = Boolean(superAdmin || user?.permissions.includes('trip.close'));
    const [trip, setTrip] = useState<Trip | null>(null); const [tab, setTab] = useState<DetailTab>('overview'); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
    const load = useCallback(async () => { if (!tripId) return; setLoading(true); try { setTrip((await tripApi.show(Number(tripId))).data); setError(''); } catch (requestError) { setError(errorMessage(requestError, t('Unable to load trip.'))); } finally { setLoading(false); } }, [tripId, t]);
    // Keep initial loading and explicit retry on the same request path.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);
    const command = async (action: 'start'|'begin-ending') => { if (!trip) return; try { setTrip((await tripApi.command(trip.id, action)).data); } catch (requestError) { setError(errorMessage(requestError, t('Unable to update trip.'))); } };
    const complete = async () => { if (!trip) return; const stockRemaining = trip.current_stock_units ?? 0; const cashRemaining = trip.financial_summary?.current_cash_hold ?? 0; if (stockRemaining > 0 || cashRemaining > 0) { setError(t('Return all stock and confirm all cash handovers before completing the trip.')); return; } try { setTrip((await tripApi.complete(trip.id)).data); } catch (requestError) { setError(errorMessage(requestError, t('Unable to complete trip.'))); } };
    const cancel = async () => { if (!trip) return; const reason = window.prompt(t('Reason for cancelling this trip?')); if (!reason?.trim()) return; try { setTrip((await tripApi.cancel(trip.id, reason.trim())).data); } catch (requestError) { setError(errorMessage(requestError, t('Unable to cancel trip.'))); } };
    const issueUrl = trip ? `/admin/transfers/representative/new?tripId=${trip.id}&warehouseId=${trip.warehouse.id}&representativeId=${trip.representative.id}` : '#';
    const returnUrl = trip ? `/admin/transfers/representative-return/new?tripId=${trip.id}&warehouseId=${trip.warehouse.id}&representativeId=${trip.representative.id}` : '#';
    if (loading && !trip) return <div className="ui-loading" role="status"><span />{t('Loading trip...')}</div>;
    if (!trip) return <div className="admin-page"><div className="ui-flash ui-flash--danger">{error || t('Trip not found.')}</div></div>;
    const finance = trip.financial_summary; const products = trip.product_summary ?? []; const completionBlocked = (trip.current_stock_units ?? 0) > 0 || (finance?.current_cash_hold ?? 0) > 0;
    const printableSales = (trip.sales ?? []).filter((sale) => sale.status !== 'draft');
    const printTripInvoices = () => {
        if (!printInvoicesA5(printableSales, branding, locale)) setError(t('Allow pop-ups to print the invoice.'));
    };
    const exportProducts = () => downloadCsv(`${trip.reference}-products.csv`, ['Product','SKU','Unit','Issued','Issued FOC','Sold','Sold FOC','Returned','Returned FOC','Remaining','Remaining FOC'].map((label) => t(label)), products.map((row) => [row.product.name,row.product.sku,row.product.unit,row.issued,row.issued_foc,row.sold,row.sold_foc,row.returned,row.returned_foc,row.remaining,row.remaining_foc]));
    const exportExpenses = () => downloadCsv(`${trip.reference}-expenses.csv`, ['Description','Amount','Recorded','Notes'].map((label) => t(label)), (trip.expenses ?? []).map((row) => [row.description,row.amount,formatDateTime(row.spent_at),row.notes ?? '']));
    const exportCollections = () => downloadCsv(`${trip.reference}-credit-collections.csv`, ['Reference','Customer code','Customer name','Amount','Method','Status','Collected'].map((label) => t(label)), (trip.customer_payments ?? []).map((row) => [row.reference,row.customer.code,row.customer.name,row.amount,row.payment_method_name ?? t(row.payment_method),t(row.status),row.posted_at ? formatDateTime(row.posted_at) : row.created_at ? formatDateTime(row.created_at) : '']));
    return <div className="admin-page trip-detail-page">
        <header className="page-heading trip-detail-heading"><div><p className="ui-eyebrow">{trip.reference}</p><h1>{trip.title}</h1><p>{trip.region.name} / {trip.warehouse.name} / {trip.representative.name}</p></div><div className="page-heading__actions"><Button icon="chevronLeft" onClick={() => navigate('/admin/trips')}>{t('Trips')}</Button>{canManage && ['planning','operation'].includes(trip.status) ? <Link className="ui-button ui-button--primary" to={issueUrl}>{t('Add stock issue')}</Link> : null}{canManage && trip.status === 'ending' ? <Link className="ui-button ui-button--primary" to={returnUrl}>{t('Record stock return')}</Link> : null}</div></header>
        {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
        <ol className="trip-progress" aria-label={t('Trip progress')}>{['planning','operation','ending','completed'].map((state, index) => <li className={['planning','operation','ending','completed'].indexOf(trip.status) >= index ? 'is-active' : ''} key={state}><span>{index + 1}</span><strong>{t(state)}</strong></li>)}</ol>
        <div className="metric-grid access-metrics"><MetricCard hint={t('Current workflow phase')} icon="truck" label={t('Status')} value={t(trip.status)} /><MetricCard hint={t('Paid and FOC base units')} icon="box" label={t('Stock remaining')} value={formatNumber(trip.current_stock_units ?? 0)} /><MetricCard hint={t('Confirmed balance currently held')} icon="cash" label={t('Cash held')} value={money(finance?.current_cash_hold)} /><MetricCard hint={t('Current outstanding across trip credit customers')} icon="customers" label={t('Latest trip credit')} value={money(finance?.latest_credit_balance)} /></div>
        <div className="trip-command-bar"><div className="trip-command-bar__context"><StatusBadge tone={statusTone(trip.status)}>{t(trip.status)}</StatusBadge><span><strong>{t('Vehicle')}</strong>{trip.vehicle.vehicle_number} / {trip.vehicle.vehicle_type}</span></div>{trip.status === 'planning' ? <p className="trip-command-bar__note"><strong>{t('Automatic stock receipt')}</strong>{t('Starting operation receives every dispatched stock issue for this trip.')}</p> : null}{trip.status === 'ending' && completionBlocked ? <p className="trip-command-bar__note"><strong>{t('Completion blocked')}</strong>{t('Return all stock and confirm all cash handovers before completing the trip.')}</p> : null}<div className="trip-command-bar__actions">{canManage && trip.status === 'planning' ? <><Button onClick={() => void cancel()} tone="danger">{t('Cancel trip')}</Button><Button onClick={() => void command('start')} tone="primary">{t('Start operation')}</Button></> : null}{canManage && trip.status === 'operation' ? <Button onClick={() => void command('begin-ending')} tone="primary">{t('Begin ending')}</Button> : null}{canClose && trip.status === 'ending' ? <Button disabled={completionBlocked} onClick={() => void complete()} tone="primary">{t('Complete trip')}</Button> : null}</div></div>
        <nav className="section-tabs trip-tabs" aria-label={t('Trip sections')} role="tablist">{(['overview','products','sales','stock','expenses','cash','collections'] as DetailTab[]).map((item) => {
            const count = item === 'products' ? products.length : item === 'sales' ? (trip.sales ?? []).length : item === 'stock' ? (trip.stock_issues ?? []).length + (trip.stock_returns ?? []).length : item === 'expenses' ? (trip.expenses ?? []).length : item === 'cash' ? (trip.cash_submissions ?? []).length : item === 'collections' ? (trip.customer_payments ?? []).length : null;
            return <button aria-selected={tab === item} key={item} onClick={() => setTab(item)} role="tab" type="button"><Icon name={detailTabIcons[item]} size={15} /><span>{t(item === 'collections' ? 'Credit collections' : item)}</span>{count !== null ? <span className="section-tab-count">{formatNumber(count)}</span> : null}</button>;
        })}</nav>
        {tab === 'overview' ? <div className="trip-detail-grid"><Panel className="trip-summary-panel" eyebrow={t('Assignment')} title={t('Trip information')}><dl className="trip-summary-list"><div><dt>{t('Representative')}</dt><dd><strong>{trip.representative.name}</strong><small>{trip.representative.code}</small></dd></div><div><dt>{t('Vehicle')}</dt><dd><strong>{trip.vehicle.vehicle_number}</strong><small>{trip.vehicle.vehicle_type}</small></dd></div><div><dt>{t('Started')}</dt><dd>{trip.started_at ? formatDateTime(trip.started_at) : t('Not started')}</dd></div><div><dt>{t('Ending')}</dt><dd>{trip.ending_at ? formatDateTime(trip.ending_at) : t('Not started')}</dd></div></dl></Panel><Panel className="trip-summary-panel" eyebrow={t('Financial state')} title={t('Trip ledger')}><dl className="trip-summary-list trip-summary-list--financial"><div><dt>{t('Cash sales')}</dt><dd>{money(finance?.cash_sales)}</dd></div><div><dt>{t('Credit sales')}</dt><dd>{money(finance?.credit_sales)}</dd></div><div><dt>{t('Expenses')}</dt><dd>{money(finance?.expenses)}</dd></div><div><dt>{t('Cash returned')}</dt><dd>{money(finance?.cash_submitted_confirmed)}</dd></div></dl></Panel></div> : null}
        {tab === 'products' ? <Panel actions={<Button disabled={products.length === 0} icon="download" onClick={exportProducts}>{t('Export CSV')}</Button>} eyebrow={t('Trip report')} title={t('Product reconciliation')}><div className="ui-table-wrap"><table className="ui-table trip-product-table"><thead><tr><th>{t('Product')}</th>{['Issued','Issued FOC','Sold','Sold FOC','Returned','Returned FOC','Remaining','Remaining FOC'].map((heading) => <th className="is-numeric" key={heading}>{t(heading)}</th>)}</tr></thead><tbody>{products.map((row) => <tr key={row.product.id}><td><strong>{row.product.name}</strong><small>{row.product.sku} / {row.product.unit}</small></td>{[row.issued,row.issued_foc,row.sold,row.sold_foc,row.returned,row.returned_foc,row.remaining,row.remaining_foc].map((value, index) => <td className="is-numeric" key={index}>{formatNumber(value)}</td>)}</tr>)}</tbody></table></div></Panel> : null}
        {tab === 'sales' ? <LedgerTable action={<Button disabled={printableSales.length === 0} icon="print" onClick={printTripInvoices}>{t('Print all A5 PDF')}</Button>} headers={['Sale','Customer','Payment','Total','Status']} rows={(trip.sales ?? []).map((sale) => [sale.reference, sale.customer.name, t(sale.payment_type), money(sale.total_amount), t(sale.status)])} title={t('Sale history')} /> : null}
        {tab === 'stock' ? <><LedgerTable headers={['Issue','Status','Units','Created']} rows={(trip.stock_issues ?? []).map((row) => [<Link className="inventory-reference-link" to={`/admin/transfers/representative/${row.id}`}>{row.reference}</Link>,t(row.status),formatNumber(row.total_quantity),row.created_at ? formatDateTime(row.created_at) : t('Not available')])} title={t('Stock issues')} /><LedgerTable headers={['Return','Status','Units','Created']} rows={(trip.stock_returns ?? []).map((row) => [<Link className="inventory-reference-link" to={`/admin/transfers/representative-return/${row.id}`}>{row.reference}</Link>,t(row.status),formatNumber(row.total_quantity),row.created_at ? formatDateTime(row.created_at) : t('Not available')])} title={t('Stock returns')} /></> : null}
        {tab === 'expenses' ? <LedgerTable exportCsv={exportExpenses} headers={['Description','Amount','Recorded','Notes']} rows={(trip.expenses ?? []).map((row) => [row.description,money(row.amount),formatDateTime(row.spent_at),row.notes ?? t('Not available')])} title={t('Trip expenses')} /> : null}
        {tab === 'cash' ? <LedgerTable headers={['Reference','Amount','Status','Created']} rows={(trip.cash_submissions ?? []).map((row) => [row.reference,money(row.amount),t(row.status),row.created_at ? formatDateTime(row.created_at) : t('Not available')])} title={t('Cash return history')} /> : null}
        {tab === 'collections' ? <LedgerTable exportCsv={exportCollections} headers={['Reference','Customer code','Customer name','Amount','Method','Status','Collected']} rows={(trip.customer_payments ?? []).map((row) => [row.reference,row.customer.code,row.customer.name,money(row.amount),row.payment_method_name ?? t(row.payment_method),t(row.status),row.posted_at ? formatDateTime(row.posted_at) : row.created_at ? formatDateTime(row.created_at) : t('Not available')])} title={t('Customer credit collection history')} /> : null}
    </div>;
}

function LedgerTable({ action, exportCsv, headers, rows, title }: { action?: ReactNode; exportCsv?: () => void; headers: string[]; rows: ReactNode[][]; title: string }) {
    const { t } = useLocale();
    return <Panel actions={action ?? (exportCsv ? <Button disabled={rows.length === 0} icon="download" onClick={exportCsv}>{t('Export CSV')}</Button> : null)} className="trip-ledger-panel" title={title}><div className="ui-table-wrap"><table className="ui-table"><thead><tr>{headers.map((header) => <th key={header}>{t(header)}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((value, column) => <td key={column}>{value}</td>)}</tr>) : <tr><td colSpan={headers.length}><EmptyState title={t('No records')} description={t('Activity will appear here when it is recorded.')} /></td></tr>}</tbody></table></div></Panel>;
}
