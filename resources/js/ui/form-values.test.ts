import { describe, expect, it } from 'vitest';
import { editableNumber } from './form-values';

describe('editableNumber', () => {
    it('preserves an empty field while converting entered values to numbers', () => {
        expect(editableNumber('')).toBe('');
        expect(editableNumber('0')).toBe(0);
        expect(editableNumber('125')).toBe(125);
    });
});
