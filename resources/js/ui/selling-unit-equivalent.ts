export type SellingEquivalentProduct = {
    unit: string;
    base_unit?: { name: string; conversion_factor: number } | null;
    default_selling_unit?: { name: string; conversion_factor: number } | null;
};

export function formatSellingUnitEquivalent(
    baseQuantity: number,
    product: SellingEquivalentProduct,
    formatNumber: (value: number) => string,
): string {
    const quantity = Math.trunc(baseQuantity);
    const baseName = product.base_unit?.name ?? product.unit;
    const sellingUnit = product.default_selling_unit;
    const conversion = sellingUnit?.conversion_factor ?? 1;

    if (!sellingUnit || conversion <= 1 || sellingUnit.name === baseName || quantity === 0) {
        return `${formatNumber(quantity)} ${baseName}`;
    }

    const sign = quantity < 0 ? -1 : 1;
    const absoluteQuantity = Math.abs(quantity);
    const sellingQuantity = Math.floor(absoluteQuantity / conversion);
    const remainder = absoluteQuantity % conversion;
    const parts: string[] = [];

    if (sellingQuantity > 0) {
        parts.push(`${formatNumber(sellingQuantity * sign)} ${sellingUnit.name}`);
    }
    if (remainder > 0) {
        parts.push(`${formatNumber(remainder)} ${baseName}`);
    }

    return parts.join(' + ');
}
