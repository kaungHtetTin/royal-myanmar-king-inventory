import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { tripApi, type Trip } from '../../services/trips';
import { Icon } from '../../ui/icons';
import { Button, EmptyState, Panel, StatusBadge } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const tone = (status: string) => status === 'operation' ? 'success' as const : status === 'planning' ? 'warning' as const : status === 'ending' ? 'info' as const : 'neutral' as const;
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export function CurrentTripPage() {
    const { formatDateTime, formatNumber, t } = useLocale();
    const money = (value = 0) => `${formatNumber(value)} MMK`;
    const [trip, setTrip] = useState<Trip | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [expenseOpen, setExpenseOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expense, setExpense] = useState({ description: '', amount: 0, notes: '' });
    const load = useCallback(async () => {
        setLoading(true);
        try { setTrip((await tripApi.current()).data); setError(''); }
        catch (requestError) { setError(message(requestError, t('Unable to load current trip.'))); }
        finally { setLoading(false); }
    }, [t]);
    // Reuse the same refresh function after expense and ending commands.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void load(); }, [load]);
    const addExpense = async (event: FormEvent) => {
        event.preventDefault(); if (!trip) return; setSaving(true);
        try { await tripApi.addExpense(trip.id, expense); setExpense({ description: '', amount: 0, notes: '' }); setExpenseOpen(false); setNotice(t('Expense recorded. It does not reduce cash held.')); await load(); }
        catch (requestError) { setError(message(requestError, t('Unable to record expense.'))); }
        finally { setSaving(false); }
    };
    const beginEnding = async () => {
        if (!trip || !window.confirm(t('Stop selling and begin returning stock and cash?'))) return;
        try { setTrip((await tripApi.beginOwnEnding(trip.id)).data); setNotice(t('Trip ending started. New sales are now blocked.')); }
        catch (requestError) { setError(message(requestError, t('Unable to begin trip ending.'))); }
    };
    if (loading && !trip) return <div className="ui-loading" role="status"><span />{t('Loading trip...')}</div>;
    return <div className="sales-page current-trip-page">
        <header className="sales-page-heading"><div><p className="ui-eyebrow">{t('Field operation')}</p><h1>{t('Current trip')}</h1><p>{t('Stock, selling, expenses, cash, and return progress for this assignment.')}</p></div></header>
        {error ? <div className="ui-flash ui-flash--danger" role="alert">{error}<button onClick={() => void load()}>{t('Retry')}</button></div> : null}
        {notice ? <div className="ui-flash ui-flash--success">{notice}</div> : null}
        {!trip ? <EmptyState title={t('No active trip')} description={t('The office must create a trip and issue stock before selling can begin.')} /> : <>
            <section className="sales-trip-hero"><div><span>{trip.reference}</span><h2>{trip.title}</h2><p>{trip.region.name} / {trip.warehouse.name}</p><small>{trip.vehicle.vehicle_number} / {trip.vehicle.vehicle_type}</small></div><StatusBadge tone={tone(trip.status)}>{t(trip.status)}</StatusBadge></section>
            <section className="sales-summary-grid sales-trip-summary">
                <article className="sales-trip-metric"><small>{t('Stock held')}</small><strong>{formatNumber(trip.current_stock_units ?? 0)}</strong><span>{t('Paid + FOC base units')}</span></article>
                <article className="sales-trip-metric"><small>{t('Paid sales')}</small><strong>{money(trip.financial_summary?.cash_sales)}</strong><span>{t('Cash + banking')}</span></article>
                <article className="sales-trip-metric"><small>{t('Cash held')}</small><strong>{money(trip.financial_summary?.current_cash_hold)}</strong><span>{t('Before office confirmation')}</span></article>
                <article className="sales-trip-metric"><small>{t('Latest credit')}</small><strong>{money(trip.financial_summary?.latest_credit_balance)}</strong><span>{t('Trip customers outstanding')}</span></article>
            </section>
            <section className="trip-payment-overview" aria-label={t('Payments by method')}>
                <header><div><p className="ui-eyebrow">{t('Money received')}</p><h2>{t('Payments by method')}</h2></div><small>{t('Paid sales + customer credit collections')}</small></header>
                <div>
                    {(trip.financial_summary?.payment_method_totals ?? []).map((method) => (
                        <article key={method.key}>
                            <span><Icon name={method.adds_to_cash_hold ? 'cash' : 'building'} size={16} /></span>
                            <div><strong>{method.name}</strong><small>{t(method.adds_to_cash_hold ? 'Included in cash hold' : 'Direct / banking')}</small></div>
                            <dl><div><dt>{t('Sales')}</dt><dd>{money(method.sales_amount)}</dd></div><div><dt>{t('Credit collected')}</dt><dd>{money(method.collection_amount)}</dd></div></dl>
                            <b>{money(method.total_amount)}</b>
                        </article>
                    ))}
                </div>
            </section>
            <section className="sales-trip-actions">
                {trip.status === 'operation' ? <Link className="ui-button ui-button--primary" to="/sales/new-sale"><Icon name="plus" />{t('New sale')}</Link> : null}
                <Link className="ui-button ui-button--secondary" to="/sales/my-stock"><Icon name="box" />{t('View stock')}</Link>
                <Link className="ui-button ui-button--secondary" to="/sales/cash-hold"><Icon name="cash" />{t('Return cash')}</Link>
                {trip.status === 'operation' ? <Button icon="reports" onClick={() => setExpenseOpen((value) => !value)}>{t('Record expense')}</Button> : null}
            </section>
            {expenseOpen ? <Panel className="sales-trip-expense-panel" eyebrow={t('Simple trip ledger')} title={t('Record expense')}><form className="management-form sales-trip-expense-form" onSubmit={addExpense}><label className="ui-field"><span>{t('Expense title')}</span><input maxLength={200} onChange={(event) => setExpense({ ...expense, description: event.target.value })} required value={expense.description} /></label><label className="ui-field"><span>{t('Amount')}</span><input min={1} onChange={(event) => setExpense({ ...expense, amount: Number(event.target.value) })} required type="number" value={expense.amount || ''} /></label><label className="ui-field sales-trip-expense-form__notes"><span>{t('Notes')}</span><input maxLength={2000} onChange={(event) => setExpense({ ...expense, notes: event.target.value })} value={expense.notes} /></label><Button disabled={saving} tone="primary" type="submit">{saving ? t('Saving...') : t('Save expense')}</Button></form></Panel> : null}
            <div className="sales-trip-history-grid"><Panel className="sales-trip-activity-panel" eyebrow={t('Trip activity')} title={t('Recent sales')}>
                {(trip.sales ?? []).length ? <div className="sales-trip-list">{(trip.sales ?? []).slice(0, 5).map((sale) => <Link key={sale.id} to={`/sales/sales-history/${sale.id}`}><div><strong>{sale.customer.name}</strong><small>{sale.reference} / {sale.created_at ? formatDateTime(sale.created_at) : t('Not available')}</small></div><span>{money(sale.total_amount)}</span></Link>)}</div> : <EmptyState title={t('No sales yet')} description={t('Posted sales for this trip will appear here.')} />}
            </Panel>
            <Panel className="sales-trip-activity-panel" eyebrow={t('Expense history')} title={t('Trip expenses')}>
                {(trip.expenses ?? []).length ? <div className="sales-trip-list">{(trip.expenses ?? []).map((row) => <article key={row.id}><div><strong>{row.description}</strong><small>{formatDateTime(row.spent_at)}</small></div><span>{money(row.amount)}</span></article>)}</div> : <EmptyState title={t('No expenses')} description={t('Keep this simple ledger for costs recorded during operation.')} />}
            </Panel></div>
            {trip.status === 'operation' ? <div className="sales-trip-ending"><div><strong>{t('Ready to finish selling?')}</strong><p>{t('Beginning ending blocks new sales and opens stock return and cash handover.')}</p></div><Button onClick={() => void beginEnding()} tone="danger">{t('Begin trip ending')}</Button></div> : null}
            {trip.status === 'ending' ? <div className="ui-flash ui-flash--warning">{t('Trip is ending. Return remaining stock and submit cash; the office will close the trip.')}</div> : null}
        </>}
    </div>;
}
