import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    TransferApiError,
    transferApi,
    type RepresentativeReturnInput,
    type RepresentativeTransfer,
    type RepresentativeTransferOptions,
} from '../../services/transfers';
import { Button } from '../../ui/primitives';
import { editableNumber } from '../../ui/form-values';

const emptyOptions: RepresentativeTransferOptions = { products: [], representatives: [], source_warehouses: [] };
const message = (error: unknown) => (error instanceof Error ? error.message : 'Unable to save representative return.');
const number = (value: number) => new Intl.NumberFormat('en-US').format(value);

export function RepresentativeReturnFormPage() {
    const navigate = useNavigate();
    const { returnId } = useParams();
    const [options, setOptions] = useState(emptyOptions);
    const [record, setRecord] = useState<RepresentativeTransfer | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        void Promise.all([
            transferApi.representativeReturnOptions(),
            returnId ? transferApi.representativeReturn(Number(returnId)) : Promise.resolve(null),
        ])
            .then(([loadedOptions, response]) => {
                if (!active) return;
                setOptions(loadedOptions);
                setRecord(response?.data ?? null);
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
    }, [returnId]);

    return (
        <div className="admin-page stock-import-form-page representative-transfer-form-page">
            <header className="page-heading">
                <div>
                    <p className="ui-eyebrow">Representative return</p>
                    <h1>{record ? `Edit ${record.reference}` : 'Create representative return'}</h1>
                    <p>Return representative stock to an accessible target warehouse with verified quantities.</p>
                </div>
            </header>
            {error ? <div className="ui-flash ui-flash--danger">{error}</div> : null}
            {loading ? (
                <div className="ui-loading" role="status">
                    <span />
                    Loading return form…
                </div>
            ) : (
                <RepresentativeReturnWizard
                    onClose={() => navigate('/admin/transfers')}
                    onSubmitted={(returnRecord) =>
                        navigate(`/admin/transfers/representative-return/${returnRecord.id}`)
                    }
                    options={options}
                    record={record}
                />
            )}
        </div>
    );
}

function RepresentativeReturnWizard({
    onClose,
    onSubmitted,
    options,
    record,
}: {
    onClose: () => void;
    onSubmitted: (record: RepresentativeTransfer) => void;
    options: RepresentativeTransferOptions;
    record: RepresentativeTransfer | null;
}) {
    const initialWarehouse = record?.source_warehouse.id ?? options.source_warehouses[0]?.id ?? 0;
    const initialRepresentative =
        record?.representative.id ??
        options.representatives.find((value) => value.primary_warehouse_id === initialWarehouse)?.id ??
        0;
    const [step, setStep] = useState(1);
    const [draftRecord, setDraftRecord] = useState(record);
    const [form, setForm] = useState<RepresentativeReturnInput>({
        items:
            record?.items.map((item) => ({
                product_id: item.product.id,
                product_unit_id: item.unit?.id,
                quantity: item.quantity,
                foc_product_unit_id: item.foc_unit?.id,
                foc_quantity: item.foc_quantity ?? 0,
            })) ?? [],
        notes: record?.notes ?? '',
        sales_representative_id: initialRepresentative,
        target_warehouse_id: initialWarehouse,
    });
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [saving, setSaving] = useState(false);
    const representatives = useMemo(
        () => options.representatives.filter((value) => value.primary_warehouse_id === form.target_warehouse_id),
        [form.target_warehouse_id, options.representatives],
    );
    const availableProducts = useMemo(
        () =>
            options.products.filter((product) => {
                const representativeId = String(form.sales_representative_id);
                return (
                    (product.representative_stock?.[representativeId] ?? 0) > 0 ||
                    (product.representative_foc_stock?.[representativeId] ?? 0) > 0
                );
            }),
        [form.sales_representative_id, options.products],
    );
    const representative = options.representatives.find((value) => value.id === form.sales_representative_id);
    const warehouse = options.source_warehouses.find((value) => value.id === form.target_warehouse_id);

    const validateStep = () => {
        const nextErrors: Record<string, string[]> = {};
        if (step === 1 && !form.target_warehouse_id) nextErrors.target_warehouse_id = ['Select a target warehouse.'];
        if (step === 1 && !form.sales_representative_id)
            nextErrors.sales_representative_id = ['Select a representative.'];
        if (step === 2 && !form.items.length) nextErrors.items = ['Select at least one product.'];
        if (step === 3) {
            form.items.forEach((item, index) => {
                const product = options.products.find((value) => value.id === item.product_id);
                const paidUnit =
                    product?.units?.find((unit) => unit.id === item.product_unit_id) ??
                    product?.units?.find((unit) => unit.is_default_selling) ??
                    product?.units?.[0];
                const focUnit = product?.units?.find((unit) => unit.id === item.foc_product_unit_id) ?? paidUnit;
                const paidBase = item.quantity * (paidUnit?.conversion_factor ?? 1);
                const focBase = (item.foc_quantity ?? 0) * (focUnit?.conversion_factor ?? 1);
                const paidAvailable = product?.representative_stock?.[String(form.sales_representative_id)] ?? 0;
                const focAvailable = product?.representative_foc_stock?.[String(form.sales_representative_id)] ?? 0;
                if (!Number.isInteger(item.quantity) || item.quantity < 0 || paidBase > paidAvailable)
                    nextErrors[`items.${index}.quantity`] = [
                        `Enter a whole paid quantity within ${number(paidAvailable)} available base units.`,
                    ];
                if (!Number.isInteger(item.foc_quantity ?? 0) || (item.foc_quantity ?? 0) < 0 || focBase > focAvailable)
                    nextErrors[`items.${index}.foc_quantity`] = [
                        `Enter a whole FOC quantity within ${number(focAvailable)} available base units.`,
                    ];
                if (paidBase + focBase < 1)
                    nextErrors[`items.${index}.quantity`] = ['Return at least one paid or FOC base unit.'];
            });
        }
        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };
    const saveDraft = async () => {
        setSaving(true);
        setErrors({});
        try {
            const response = draftRecord
                ? await transferApi.updateRepresentativeReturn(draftRecord.id, form)
                : await transferApi.createRepresentativeReturn(form);
            setDraftRecord(response.data);
            return response.data;
        } catch (requestError) {
            const fields = requestError instanceof TransferApiError ? requestError.fields : {};
            setErrors({ ...fields, form: [message(requestError)] });
            return null;
        } finally {
            setSaving(false);
        }
    };
    const post = async () => {
        const saved = await saveDraft();
        if (!saved) return;
        setSaving(true);
        try {
            onSubmitted((await transferApi.representativeReturnCommand(saved.id, 'post')).data);
        } catch (requestError) {
            setErrors({ form: [message(requestError)] });
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="stock-import-form-page__panel warehouse-transfer-form-page__panel">
            <form className="management-form" onSubmit={(event) => event.preventDefault()}>
                <ol aria-label="Representative return progress" className="form-stepper transfer-form-stepper">
                    {['Return information', 'Product selection', 'Unit & quantity', 'Review & post'].map(
                        (label, index) => (
                            <li
                                aria-current={step === index + 1 ? 'step' : undefined}
                                className={step >= index + 1 ? 'is-active' : ''}
                                key={label}
                            >
                                <span>{index + 1}</span>
                                <strong>{label}</strong>
                            </li>
                        ),
                    )}
                </ol>
                {errors.form?.[0] ? <div className="ui-form-error">{errors.form[0]}</div> : null}

                {step === 1 ? (
                    <div className="form-grid transfer-wizard-section">
                        <label className="ui-field representative-warehouse-field">
                            <span>Target warehouse</span>
                            <select
                                onChange={(event) => {
                                    const warehouseId = Number(event.target.value);
                                    const first = options.representatives.find(
                                        (value) => value.primary_warehouse_id === warehouseId,
                                    );
                                    setForm({
                                        ...form,
                                        items: [],
                                        sales_representative_id: first?.id ?? 0,
                                        target_warehouse_id: warehouseId,
                                    });
                                }}
                                value={form.target_warehouse_id}
                            >
                                {options.source_warehouses.map((value) => (
                                    <option key={value.id} value={value.id}>
                                        {value.code} · {value.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={errors} name="target_warehouse_id" />
                        </label>
                        <label className="ui-field representative-select-field">
                            <span>Representative</span>
                            <select
                                onChange={(event) =>
                                    setForm({
                                        ...form,
                                        items: [],
                                        sales_representative_id: Number(event.target.value),
                                    })
                                }
                                value={form.sales_representative_id}
                            >
                                <option value={0}>Select representative</option>
                                {representatives.map((value) => (
                                    <option key={value.id} value={value.id}>
                                        {value.code} · {value.name}
                                    </option>
                                ))}
                            </select>
                            <FieldError errors={errors} name="sales_representative_id" />
                        </label>
                        <label className="ui-field form-grid__wide">
                            <span>Notes</span>
                            <textarea
                                maxLength={2000}
                                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                                rows={3}
                                value={form.notes}
                            />
                        </label>
                    </div>
                ) : null}

                {step === 2 ? (
                    <div className="stock-import-products transfer-wizard-section">
                        <div className="import-lines__heading">
                            <strong>Select representative stock</strong>
                            <small>{form.items.length} selected</small>
                        </div>
                        {availableProducts.length ? (
                            <div className="stock-import-products__list">
                                {availableProducts.map((product) => {
                                    const selected = form.items.some((item) => item.product_id === product.id);
                                    const available =
                                        product.representative_stock?.[String(form.sales_representative_id)] ?? 0;
                                    const focAvailable =
                                        product.representative_foc_stock?.[String(form.sales_representative_id)] ?? 0;
                                    const defaultUnit =
                                        product.units?.find((unit) => unit.is_default_selling) ?? product.units?.[0];
                                    return (
                                        <label
                                            className={`stock-import-product ${selected ? 'is-selected' : ''}`}
                                            key={product.id}
                                        >
                                            <input
                                                aria-label={`Select ${product.name}`}
                                                checked={selected}
                                                onChange={() =>
                                                    setForm({
                                                        ...form,
                                                        items: selected
                                                            ? form.items.filter(
                                                                  (item) => item.product_id !== product.id,
                                                              )
                                                            : [
                                                                  ...form.items,
                                                                  {
                                                                      product_id: product.id,
                                                                      product_unit_id: defaultUnit?.id,
                                                                      quantity: available > 0 ? 1 : 0,
                                                                      foc_product_unit_id: defaultUnit?.id,
                                                                      foc_quantity: 0,
                                                                  },
                                                              ],
                                                    })
                                                }
                                                type="checkbox"
                                            />
                                            <span>
                                                <strong>{product.name}</strong>
                                                <small>
                                                    {product.sku} · {number(available)} paid / {number(focAvailable)}{' '}
                                                    FOC base available
                                                </small>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="ui-empty-state">
                                <strong>No stock available</strong>
                                <p>This representative has no products available to return.</p>
                            </div>
                        )}
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}

                {step === 3 ? (
                    <div className="transfer-wizard-section">
                        <div className="import-lines__heading">
                            <strong>Set return units and quantities</strong>
                            <small>Paid and FOC balances are checked separately in base units.</small>
                        </div>
                        <div className="transfer-wizard-quantities">
                            {form.items.map((item, index) => {
                                const product = options.products.find((value) => value.id === item.product_id);
                                const paidAvailable =
                                    product?.representative_stock?.[String(form.sales_representative_id)] ?? 0;
                                const focAvailable =
                                    product?.representative_foc_stock?.[String(form.sales_representative_id)] ?? 0;
                                const paidUnit =
                                    product?.units?.find((unit) => unit.id === item.product_unit_id) ??
                                    product?.units?.find((unit) => unit.is_default_selling) ??
                                    product?.units?.[0];
                                const focUnit =
                                    product?.units?.find((unit) => unit.id === item.foc_product_unit_id) ?? paidUnit;
                                const paidBase = item.quantity * (paidUnit?.conversion_factor ?? 1);
                                const focBase = (item.foc_quantity ?? 0) * (focUnit?.conversion_factor ?? 1);
                                const paidInvalid =
                                    !Number.isInteger(item.quantity) || item.quantity < 0 || paidBase > paidAvailable;
                                const focInvalid =
                                    !Number.isInteger(item.foc_quantity ?? 0) ||
                                    (item.foc_quantity ?? 0) < 0 ||
                                    focBase > focAvailable;
                                return (
                                    <div
                                        className={`import-line import-line--quantity transfer-quantity-line ${paidInvalid || focInvalid ? 'is-invalid' : ''}`}
                                        key={item.product_id}
                                    >
                                        <div className="transfer-quantity-line__product">
                                            <strong>{product?.name}</strong>
                                            <small className="stock-availability">
                                                Paid: {number(paidAvailable)} · FOC: {number(focAvailable)} base
                                                available
                                            </small>
                                            <small>{product?.sku}</small>
                                        </div>
                                        <label className="ui-field transfer-quantity-line__paid-unit">
                                            <span>Return unit</span>
                                            <select
                                                aria-label="Return unit"
                                                onChange={(event) =>
                                                    setForm({
                                                        ...form,
                                                        items: form.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      product_unit_id: Number(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    })
                                                }
                                                value={paidUnit?.id}
                                            >
                                                {product?.units?.map((unit) => (
                                                    <option key={unit.id} value={unit.id}>
                                                        {unit.name} ({unit.conversion_factor} base)
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="ui-field transfer-quantity-line__paid-quantity">
                                            <span>Paid quantity</span>
                                            <input
                                                aria-label="Paid quantity"
                                                aria-invalid={paidInvalid}
                                                min={0}
                                                onChange={(event) =>
                                                    setForm({
                                                        ...form,
                                                        items: form.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      quantity: editableNumber(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    })
                                                }
                                                required
                                                type="number"
                                                value={item.quantity}
                                            />
                                            {errors[`items.${index}.quantity`]?.[0] ? (
                                                <small className="ui-field__error">
                                                    {errors[`items.${index}.quantity`][0]}
                                                </small>
                                            ) : null}
                                        </label>
                                        <label className="ui-field transfer-quantity-line__foc-unit">
                                            <span>FOC unit</span>
                                            <select
                                                aria-label="FOC unit"
                                                disabled={focAvailable < 1}
                                                onChange={(event) =>
                                                    setForm({
                                                        ...form,
                                                        items: form.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      foc_product_unit_id: Number(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    })
                                                }
                                                value={focUnit?.id}
                                            >
                                                {product?.units?.map((unit) => (
                                                    <option key={unit.id} value={unit.id}>
                                                        {unit.name} ({unit.conversion_factor} base)
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="ui-field transfer-quantity-line__foc-quantity">
                                            <span>FOC quantity</span>
                                            <input
                                                aria-label="FOC quantity"
                                                aria-invalid={focInvalid}
                                                disabled={focAvailable < 1}
                                                min={0}
                                                onChange={(event) =>
                                                    setForm({
                                                        ...form,
                                                        items: form.items.map((line, lineIndex) =>
                                                            lineIndex === index
                                                                ? {
                                                                      ...line,
                                                                      foc_product_unit_id:
                                                                          line.foc_product_unit_id ?? focUnit?.id,
                                                                      foc_quantity: editableNumber(event.target.value),
                                                                  }
                                                                : line,
                                                        ),
                                                    })
                                                }
                                                type="number"
                                                value={item.foc_quantity ?? 0}
                                            />
                                            {errors[`items.${index}.foc_quantity`]?.[0] ? (
                                                <small className="ui-field__error">
                                                    {errors[`items.${index}.foc_quantity`][0]}
                                                </small>
                                            ) : null}
                                        </label>
                                        <strong className="transfer-base-total">
                                            {number(paidBase)} paid / {number(focBase)} FOC base
                                        </strong>
                                    </div>
                                );
                            })}
                        </div>
                        <FieldError errors={errors} name="items" />
                    </div>
                ) : null}

                {step === 4 ? (
                    <div className="transfer-wizard-section transfer-wizard-review">
                        <section>
                            <span>Representative</span>
                            <strong>{representative?.name}</strong>
                        </section>
                        <section>
                            <span>Target warehouse</span>
                            <strong>{warehouse?.name}</strong>
                        </section>
                        <section>
                            <span>Products</span>
                            <strong>{form.items.length}</strong>
                        </section>
                        <section>
                            <span>Paid / FOC base</span>
                            <strong>
                                {form.items.reduce((sum, item) => {
                                    const product = options.products.find((value) => value.id === item.product_id);
                                    const unit =
                                        product?.units?.find((value) => value.id === item.product_unit_id) ??
                                        product?.units?.find((value) => value.is_default_selling) ??
                                        product?.units?.[0];
                                    return sum + item.quantity * (unit?.conversion_factor ?? 1);
                                }, 0)}{' '}
                                /{' '}
                                {form.items.reduce((sum, item) => {
                                    const product = options.products.find((value) => value.id === item.product_id);
                                    const unit =
                                        product?.units?.find((value) => value.id === item.foc_product_unit_id) ??
                                        product?.units?.find((value) => value.id === item.product_unit_id) ??
                                        product?.units?.find((value) => value.is_default_selling) ??
                                        product?.units?.[0];
                                    return sum + (item.foc_quantity ?? 0) * (unit?.conversion_factor ?? 1);
                                }, 0)}
                            </strong>
                        </section>
                        <div className="ui-table-wrap">
                            <table className="ui-table transfer-wizard-review__table">
                                <thead>
                                    <tr>
                                        <th>Product</th>
                                        <th className="is-numeric">Paid</th>
                                        <th className="is-numeric">FOC</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {form.items.map((item) => {
                                        const product = options.products.find((value) => value.id === item.product_id);
                                        const paidUnit =
                                            product?.units?.find((unit) => unit.id === item.product_unit_id) ??
                                            product?.units?.find((unit) => unit.is_default_selling) ??
                                            product?.units?.[0];
                                        const focUnit =
                                            product?.units?.find((unit) => unit.id === item.foc_product_unit_id) ??
                                            paidUnit;
                                        return (
                                            <tr key={item.product_id}>
                                                <td>
                                                    <strong>{product?.name}</strong>
                                                    <small>
                                                        {product?.sku} · {product?.unit}
                                                    </small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{item.quantity}</strong>
                                                    <small>
                                                        {paidUnit?.name ?? product?.unit} ·{' '}
                                                        {item.quantity * (paidUnit?.conversion_factor ?? 1)} base
                                                    </small>
                                                </td>
                                                <td className="is-numeric">
                                                    <strong>{item.foc_quantity ?? 0}</strong>
                                                    <small>
                                                        {focUnit?.name ?? product?.unit} ·{' '}
                                                        {(item.foc_quantity ?? 0) * (focUnit?.conversion_factor ?? 1)}{' '}
                                                        base
                                                    </small>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        {form.notes ? (
                            <p className="transfer-wizard-review__notes">
                                <strong>Notes:</strong> {form.notes}
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </form>
            <footer className="stock-import-form-page__actions">
                {step === 1 ? (
                    <Button onClick={onClose}>Cancel</Button>
                ) : (
                    <Button onClick={() => setStep(step - 1)}>Back</Button>
                )}
                {step === 3 ? (
                    <Button disabled={saving} onClick={() => void saveDraft()} requiresOnline>
                        {saving ? 'Saving…' : 'Save draft'}
                    </Button>
                ) : null}
                {step < 4 ? (
                    <Button onClick={() => validateStep() && setStep(step + 1)} tone="primary">
                        Continue
                    </Button>
                ) : (
                    <Button disabled={saving} onClick={() => void post()} requiresOnline tone="primary">
                        {saving ? 'Posting…' : 'Save & post return'}
                    </Button>
                )}
            </footer>
        </section>
    );
}

function FieldError({ errors, name }: { errors: Record<string, string[]>; name: string }) {
    return errors[name]?.[0] ? <span className="ui-field__error">{errors[name][0]}</span> : null;
}
