export type SellingEquivalentProduct = {
    unit: string;
    base_unit?: { name: string; conversion_factor: number } | string | null;
    default_selling_unit?: { name: string; conversion_factor: number } | null;
    units?: Array<{ name: string; conversion_factor: number }>;
};

export function formatSellingUnitEquivalent(
    baseQuantity: number,
    product: SellingEquivalentProduct,
    formatNumber: (value: number) => string,
): string {
    const quantity = Math.trunc(baseQuantity);
    const sign = quantity < 0 ? -1 : 1;
    let remainder = Math.abs(quantity);
    const baseUnit = typeof product.base_unit === 'string' ? null : product.base_unit;
    const baseName =
        (typeof product.base_unit === 'string' ? product.base_unit : product.base_unit?.name) ??
        product.units?.find((unit) => unit.conversion_factor === 1)?.name ??
        product.unit;
    const configuredUnits = product.units?.length
        ? product.units
        : [product.default_selling_unit, baseUnit].filter((unit): unit is { name: string; conversion_factor: number } =>
              Boolean(unit),
          );
    const units = [...configuredUnits, { name: baseName, conversion_factor: 1 }]
        .filter((unit) => Number.isInteger(unit.conversion_factor) && unit.conversion_factor > 0)
        .sort((left, right) => right.conversion_factor - left.conversion_factor)
        .filter(
            (unit, index, all) =>
                all.findIndex((candidate) => candidate.conversion_factor === unit.conversion_factor) === index,
        );
    const parts: string[] = [];

    for (const unit of units) {
        const unitQuantity = Math.floor(remainder / unit.conversion_factor);
        if (unitQuantity > 0) {
            parts.push(`${formatNumber(unitQuantity * sign)} ${unit.name}`);
            remainder %= unit.conversion_factor;
        }
    }

    return parts.length ? parts.join(' + ') : `${formatNumber(0)} ${baseName}`;
}
