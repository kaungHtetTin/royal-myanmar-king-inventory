import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { TransferApiError, transferApi, type ProductOption, type RepresentativeReturnInput, type RepresentativeTransfer, type RepresentativeTransferOptions } from '../../services/transfers';
import { Button, EmptyState } from '../../ui/primitives';
import { useLocale } from '../../localization/locale-context';

const emptyOptions: RepresentativeTransferOptions = { products: [], representatives: [], source_warehouses: [] };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
type ReturnLine = { productId: number; paid: number; foc: number };
type Holding = { product: ProductOption; baseUnit: ProductOption['units'] extends Array<infer Unit> | undefined ? Unit | undefined : never; heldPaid: number; heldFoc: number };
type ReturnItem = Holding & { paid: number; foc: number };
type Locale = ReturnType<typeof useLocale>;

export function RepresentativeReturnFormPage() {
    const { formatNumber, t } = useLocale();
    const navigate = useNavigate();
    const { returnId } = useParams();
    const [params] = useSearchParams();
    const preset = { tripId: Number(params.get('tripId') ?? 0), warehouseId: Number(params.get('warehouseId') ?? 0), representativeId: Number(params.get('representativeId') ?? 0) };
    const [options, setOptions] = useState(emptyOptions);
    const [record, setRecord] = useState<RepresentativeTransfer | null>(null);
    const [selection, setSelection] = useState({ representativeId: preset.representativeId, warehouseId: preset.warehouseId });
    const [lines, setLines] = useState<ReturnLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([transferApi.representativeReturnOptions(), returnId ? transferApi.representativeReturn(Number(returnId)) : Promise.resolve(null)])
            .then(([available, response]) => {
                if (!active) return;
                setOptions(available); setRecord(response?.data ?? null);
                if (response?.data && !response.data.trip) setLines(response.data.items.map((item) => ({ productId: item.product.id, paid: item.base_quantity ?? 0, foc: item.foc_base_quantity ?? 0 })));
            }).catch((requestError) => { if (active) setError(message(requestError, t('Unable to load the stock return form.'))); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [returnId, t]);

    const tripId = record?.trip?.id ?? preset.tripId;
    const representativeId = record?.representative.id ?? selection.representativeId;
    const selectedRepresentative = options.representatives.find((item) => item.id === representativeId);
    const warehouseId = record?.source_warehouse.id ?? (selection.warehouseId || selectedRepresentative?.primary_warehouse_id || 0);
    const warehouse = options.source_warehouses.find((item) => item.id === warehouseId) ?? record?.source_warehouse;
    const representative = selectedRepresentative ?? record?.representative;
    const holdings = useMemo(() => options.products.map((product) => ({ product, baseUnit: product.units?.find((unit) => unit.is_base), heldPaid: product.representative_stock?.[String(representativeId)] ?? 0, heldFoc: product.representative_foc_stock?.[String(representativeId)] ?? 0 })).filter((item) => item.heldPaid > 0 || item.heldFoc > 0), [options.products, representativeId]);
    const returnItems = tripId ? holdings.map((item) => ({ ...item, paid: item.heldPaid, foc: item.heldFoc })) : holdings.filter((item) => lines.some((line) => line.productId === item.product.id)).map((item) => { const line = lines.find((value) => value.productId === item.product.id)!; return { ...item, paid: line.paid, foc: line.foc }; });
    const paidTotal = returnItems.reduce((sum, item) => sum + item.paid, 0);
    const focTotal = returnItems.reduce((sum, item) => sum + item.foc, 0);
    const canSubmit = Boolean(warehouseId && representativeId && returnItems.length && returnItems.every((item) => item.baseUnit && (item.paid > 0 || item.foc > 0) && item.paid <= item.heldPaid && item.foc <= item.heldFoc));
    const back = () => navigate(tripId ? `/admin/trips/${tripId}` : '/admin/transfers');
    const toggle = (productId: number) => setLines((value) => value.some((line) => line.productId === productId) ? value.filter((line) => line.productId !== productId) : [...value, { productId, paid: 0, foc: 0 }]);
    const quantity = (productId: number, field: 'paid' | 'foc', amount: number) => setLines((value) => value.map((line) => line.productId === productId ? { ...line, [field]: amount } : line));

    const submit = async () => {
        if (!canSubmit) return;
        setSaving(true); setError('');
        const input: RepresentativeReturnInput = { trip_id: tripId || null, target_warehouse_id: warehouseId, sales_representative_id: representativeId, notes: tripId ? t('Complete stock return posted from trip ending review.') : t('Partial stock return authorized from the admin dashboard.'), items: returnItems.map(({ product, baseUnit, paid, foc }) => ({ product_id: product.id, product_unit_id: baseUnit!.id, quantity: paid, ...(foc ? { foc_product_unit_id: baseUnit!.id, foc_quantity: foc } : {}) })) };
        try {
            const saved = record ? await transferApi.updateRepresentativeReturn(record.id, input) : await transferApi.createRepresentativeReturn(input);
            await transferApi.representativeReturnCommand(saved.data.id, 'post'); back();
        } catch (requestError) {
            const fields = requestError instanceof TransferApiError ? requestError.fields : {};
            setError(fields.items?.[0] ?? fields.trip_id?.[0] ?? message(requestError, t('Unable to return representative stock.')));
        } finally { setSaving(false); }
    };

    return <div className="admin-page stock-import-form-page representative-return-review-page">
        <header className="page-heading"><div><p className="ui-eyebrow">{t(tripId ? 'Trip ending' : 'Admin authorization')}</p><h1>{t(tripId ? 'Return all stock' : 'Authorize stock return')}</h1><p>{t(tripId ? 'Review every paid and FOC unit before returning the full holding to the warehouse.' : 'Select one or more products and enter the paid and FOC quantities to return.')}</p></div></header>
        {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
        {loading ? <div className="ui-loading" role="status"><span />{t('Loading stock return form…')}</div> : <section className="stock-import-form-page__panel complete-return-review">
            <form className="management-form" onSubmit={(event) => event.preventDefault()}>
                {!record && !preset.representativeId ? <div className="trip-coverage-selectors representative-return-assignment">
                    <label className="ui-field"><span>{t('Sales representative')}</span><select value={representativeId} onChange={(event) => { const id = Number(event.target.value); const rep = options.representatives.find((item) => item.id === id); setSelection({ representativeId: id, warehouseId: rep?.primary_warehouse_id ?? 0 }); setLines([]); }}><option value={0}>{t('Select representative')}</option>{options.representatives.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><small>{t('Choose the representative whose held stock is being returned.')}</small></label>
                    <label className="ui-field"><span>{t('Return warehouse')}</span><select disabled={!representativeId} value={warehouseId} onChange={(event) => setSelection((value) => ({ ...value, warehouseId: Number(event.target.value) }))}><option value={0}>{t('Select warehouse')}</option>{options.source_warehouses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><small>{t('Authorized returns go to the representative primary warehouse.')}</small></label>
                </div> : null}
                {tripId ? <div className="complete-return-review__notice"><span>✓</span><div><strong>{t('Complete return only')}</strong><p>{t('Submitting returns every unit shown below. Product and quantity changes are not allowed.')}</p></div></div> : null}
                <div className="complete-return-review__context"><div><span>{t('Representative')}</span><strong>{representative ? `${representative.code} · ${representative.name}` : t('Not selected')}</strong></div><div><span>{t('Return warehouse')}</span><strong>{warehouse ? `${warehouse.code} · ${warehouse.name}` : t('Not selected')}</strong></div></div>
                {!tripId && representativeId && holdings.length ? <ProductSelection holdings={holdings} lines={lines} toggle={toggle} formatNumber={formatNumber} t={t} /> : null}
                {!tripId && returnItems.length ? <div className="transfer-wizard-quantities">{returnItems.map(({ product, heldPaid, heldFoc, paid, foc }) => <div className="import-line import-line--quantity" key={product.id}><div><strong>{product.name}</strong><small>{product.sku}</small></div><label className="ui-field"><span>{t('Paid return')}</span><input max={heldPaid} min={0} onChange={(event) => quantity(product.id, 'paid', Number(event.target.value))} type="number" value={paid} /><small>{t('{count} available', { count: formatNumber(heldPaid) })}</small></label><label className="ui-field"><span>{t('FOC return')}</span><input max={heldFoc} min={0} onChange={(event) => quantity(product.id, 'foc', Number(event.target.value))} type="number" value={foc} /><small>{t('{count} available', { count: formatNumber(heldFoc) })}</small></label></div>)}</div> : null}
                <div className="complete-return-review__metrics"><article><span>{t('Products')}</span><strong>{formatNumber(returnItems.length)}</strong></article><article><span>{t('Paid units')}</span><strong>{formatNumber(paidTotal)}</strong></article><article><span>{t('FOC units')}</span><strong>{formatNumber(focTotal)}</strong></article><article><span>{t('Total units')}</span><strong>{formatNumber(paidTotal + focTotal)}</strong></article></div>
                {tripId && holdings.length ? <ReturnTable items={returnItems} formatNumber={formatNumber} t={t} /> : null}
                {!holdings.length && representativeId ? <EmptyState title={t('No stock to return')} description={t('This representative is not holding any paid or FOC stock.')} /> : null}
            </form>
            <footer className="stock-import-form-page__actions"><Button disabled={saving} onClick={back}>{t('Cancel')}</Button><Button disabled={!canSubmit || saving} icon="check" onClick={() => void submit()} requiresOnline tone="primary">{saving ? t('Returning stock…') : t(tripId ? 'Confirm full return' : 'Authorize return')}</Button></footer>
        </section>}
    </div>;
}

function ProductSelection({ holdings, lines, toggle, formatNumber, t }: { holdings: Holding[]; lines: ReturnLine[]; toggle: (productId: number) => void; formatNumber: Locale['formatNumber']; t: Locale['t'] }) {
    return <div className="stock-import-products transfer-wizard-section"><div className="import-lines__heading"><strong>{t('Select products')}</strong><small>{t('{count} selected', { count: formatNumber(lines.length) })}</small></div><div className="stock-import-products__list">{holdings.map(({ product, heldPaid, heldFoc }) => { const selected = lines.some((line) => line.productId === product.id); return <label className={`stock-import-product ${selected ? 'is-selected' : ''}`} key={product.id}><input checked={selected} onChange={() => toggle(product.id)} type="checkbox" /><span><strong>{product.name}</strong><small>{product.sku} · {formatNumber(heldPaid)} {t('paid')} · {formatNumber(heldFoc)} {t('FOC')}</small></span></label>; })}</div></div>;
}

function ReturnTable({ items, formatNumber, t }: { items: ReturnItem[]; formatNumber: Locale['formatNumber']; t: Locale['t'] }) {
    return <div className="ui-table-wrap"><table className="ui-table complete-return-review__table"><thead><tr><th>{t('Product')}</th><th className="is-numeric">{t('Paid return')}</th><th className="is-numeric">{t('FOC return')}</th><th className="is-numeric">{t('Total')}</th></tr></thead><tbody>{items.map(({ baseUnit, foc, paid, product }) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku} · {baseUnit?.name ?? product.unit}</small></td><td className="is-numeric"><strong>{formatNumber(paid)}</strong></td><td className="is-numeric"><strong>{formatNumber(foc)}</strong></td><td className="is-numeric"><strong>{formatNumber(paid + foc)}</strong></td></tr>)}</tbody></table></div>;
}
