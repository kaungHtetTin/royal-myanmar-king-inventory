import { describe, expect, it } from 'vitest';
import { invoiceDocument, invoicePaperSizes } from './invoice-print';
import type { Sale } from './sales';

const sale: Sale = {
    id: 7,
    reference: 'SAL-000007',
    representative: { id: 2, code: 'SR-02', name: 'Ma Su', phone: '09-200' },
    warehouse: { id: 1, code: 'YGN', name: 'Yangon Warehouse', address: 'Hlaing', phone: '01-200' },
    customer: { id: 3, code: 'CUS-03', name: 'A & B <Shop>', address: 'Insein Road', phone: '09-300' },
    payment_type: 'cash',
    total_amount: 2500,
    status: 'posted',
    notes: '<script>alert("unsafe")</script>',
    creation_location: null,
    items: [
        {
            id: 1,
            product: { id: 4, sku: 'SKU-04', name: 'Tea', unit: 'box' },
            quantity: 2,
            unit_price: 1250,
            line_total: 2500,
        },
    ],
    total_quantity: 2,
    posted_at: '2026-08-22T08:30:00.000Z',
    voided_at: null,
    void_reason: null,
    created_at: '2026-08-22T08:00:00.000Z',
};

describe('invoice printing', () => {
    it('supports full-page and thermal paper sizes', () => {
        expect(invoicePaperSizes.map((option) => option.value)).toEqual(['a4', 'a5', '80mm', '58mm', '50mm']);

        expect(invoiceDocument(sale, undefined, 'a4')).toContain('@page{size:A4;margin:14mm}');
        expect(invoiceDocument(sale, undefined, 'a5')).toContain('class="paper-a5 page-sheet"');
        expect(invoiceDocument(sale, undefined, '80mm')).toContain('@page{size:80mm auto;margin:3mm}');
        expect(invoiceDocument(sale, undefined, '58mm')).toContain('class="paper-58mm thermal"');
        expect(invoiceDocument(sale, undefined, '50mm')).toContain('class="paper-50mm thermal"');
    });

    it('renders invoice identity, contacts, lines, and totals safely', () => {
        const document = invoiceDocument(sale);

        expect(document).toContain('Invoice SAL-000007');
        expect(document).toContain('A &amp; B &lt;Shop&gt;');
        expect(document).toContain('2,500 MMK');
        expect(document).toContain('Yangon Warehouse');
        expect(document).not.toContain('<script>alert');
    });

    it('marks voided invoices and includes the reason', () => {
        const document = invoiceDocument({ ...sale, status: 'voided', void_reason: 'Returned stock' });

        expect(document).toContain('<div class="void">VOID</div>');
        expect(document).toContain('Returned stock');
    });

    it('uses configured business branding and invoice defaults', () => {
        const document = invoiceDocument(sale, {
            business_name: 'Valley Distribution',
            business_tagline: 'Warehouse operations',
            currency_code: 'USD',
            favicon_url: null,
            invoice_footer: 'Payment received with thanks.',
            logo_url: '/api/branding/assets/logo',
            primary_color: '#245e57',
        });

        expect(document).toContain('Valley Distribution');
        expect(document).toContain('2,500 USD');
        expect(document).toContain('Payment received with thanks.');
        expect(document).toContain('#245e57');
    });
});
