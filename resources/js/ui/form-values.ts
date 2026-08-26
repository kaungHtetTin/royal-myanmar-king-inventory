/** Preserve an empty controlled number input while the user is editing it. */
export function editableNumber(value: string): number {
    return (value === '' ? '' : Number(value)) as number;
}
