import { describe, expect, it } from 'vitest';
import { formatSellingUnitEquivalent, type SellingEquivalentProduct } from './selling-unit-equivalent';

const cartonProduct: SellingEquivalentProduct = {
    unit: 'carton',
    base_unit: { name: 'bottle', conversion_factor: 1 },
    default_selling_unit: { name: 'carton', conversion_factor: 12 },
};
const formatNumber = (value: number) => String(value);

describe('formatSellingUnitEquivalent', () => {
    it('shows selling units followed by the base-unit remainder', () => {
        expect(formatSellingUnitEquivalent(88, cartonProduct, formatNumber)).toBe('7 carton + 4 bottle');
        expect(formatSellingUnitEquivalent(84, cartonProduct, formatNumber)).toBe('7 carton');
    });

    it('avoids zero selling-unit prefixes for small and zero quantities', () => {
        expect(formatSellingUnitEquivalent(4, cartonProduct, formatNumber)).toBe('4 bottle');
        expect(formatSellingUnitEquivalent(0, cartonProduct, formatNumber)).toBe('0 bottle');
    });
});
