import type { Branding } from '../branding/branding-context';
import type { Sale } from './sales';
import type { AppLocale } from '../localization/locale-context';
import { myanmarTranslations } from '../localization/translations';

const escapeHtml = (value: string | number | null | undefined) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

const dateTime = (value: string | null, locale: AppLocale) =>
    value
        ? new Intl.DateTimeFormat(locale === 'my' ? 'my-MM' : 'en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
          }).format(new Date(value))
        : '—';

const fallbackBranding: Branding = {
    business_name: 'StockFlow',
    business_tagline: 'Inventory & Sales',
    favicon_url: null,
    logo_url: null,
    primary_color: '#087f74',
};

export type InvoicePaperSize = 'a4' | 'a5' | '80mm' | '58mm' | '50mm';

export const invoicePaperSizes: ReadonlyArray<{
    description: string;
    label: string;
    value: InvoicePaperSize;
}> = [
    { description: '210 × 297 mm · full-page invoice', label: 'A4', value: 'a4' },
    { description: '148 × 210 mm · compact full-page invoice', label: 'A5', value: 'a5' },
    { description: 'Standard thermal receipt', label: '80 mm', value: '80mm' },
    { description: 'Narrow thermal receipt', label: '58 mm', value: '58mm' },
    { description: 'Compact thermal receipt', label: '50 mm', value: '50mm' },
];

const paperPageSize: Record<InvoicePaperSize, string> = {
    a4: 'A4',
    a5: 'A5',
    '80mm': '80mm auto',
    '58mm': '58mm auto',
    '50mm': '50mm auto',
};

export function invoiceDocument(
    sale: Sale,
    branding: Branding = fallbackBranding,
    paperSize: InvoicePaperSize = 'a4',
    locale: AppLocale = 'en',
) {
    const t = (key: string) => (locale === 'my' ? (myanmarTranslations[key] ?? key) : key);
    const currency = branding.currency_code ?? 'MMK';
    const money = (value: number) =>
        `${new Intl.NumberFormat(locale === 'my' ? 'my-MM' : 'en-US').format(value)} ${currency}`;
    const issuedAt = sale.posted_at ?? sale.created_at;
    const contact = [sale.customer.phone, sale.customer.address].filter(Boolean).map(escapeHtml).join('<br>');
    const businessContact = [
        branding.business_address ?? sale.warehouse.address,
        branding.business_phone ?? sale.warehouse.phone,
        branding.business_email,
    ]
        .filter(Boolean)
        .map(escapeHtml)
        .join(' · ');
    const lines = sale.items
        .map(
            (item, index) => `<tr>
                <td class="item-index number">${index + 1}</td>
                <td class="item-product"><strong>${escapeHtml(item.product.name)}</strong><small>${escapeHtml(item.product.sku)}</small></td>
                <td class="item-sold number" data-label="${escapeHtml(t('Sold'))}">${item.quantity} ${escapeHtml(item.unit?.name ?? item.product.unit)}</td>
                <td class="item-foc number" data-label="FOC">${item.foc_quantity ? `${item.foc_quantity} ${escapeHtml(item.foc_unit?.name ?? item.unit?.name ?? item.product.unit)}` : '—'}</td>
                <td class="item-price number" data-label="${escapeHtml(t('Price'))}">${escapeHtml(money(item.unit_price))}</td>
                <td class="item-discount number" data-label="${escapeHtml(t('Discount'))}">${(item.discount_percentage ?? 0) > 0 ? `${item.discount_percentage}% · ${escapeHtml(money(item.discount_amount ?? 0))}` : '—'}${item.promotion_amount ? `<small>${escapeHtml(item.promotion_title || t('Promotion'))}: -${escapeHtml(money(item.promotion_amount))}</small>` : ''}</td>
                <td class="item-amount number" data-label="${escapeHtml(t('Amount'))}"><strong>${escapeHtml(money(item.line_total))}</strong></td>
            </tr>`,
        )
        .join('');
    const thermal = paperSize.endsWith('mm');
    const pageMargin = paperSize === 'a4' ? '14mm' : paperSize === 'a5' ? '10mm' : '3mm';

    return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(t('Invoice'))} ${escapeHtml(sale.reference)}</title>
<style>
@page{size:${paperPageSize[paperSize]};margin:${pageMargin}}*{box-sizing:border-box}body{margin:0;color:#172033;font:12px/1.45 Inter,"Noto Sans Myanmar",Arial,sans-serif}main{max-width:820px;margin:0 auto}.top{display:flex;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:2px solid ${escapeHtml(branding.primary_color)}}.brand{display:flex;align-items:center;gap:10px}.mark{display:grid;width:38px;height:38px;place-items:center;overflow:hidden;border-radius:6px;color:#fff;background:${escapeHtml(branding.primary_color)};font-weight:800}.mark img{width:100%;height:100%;object-fit:contain;background:#fff}.brand strong{display:block;font-size:20px}.brand small,.muted,small{display:block;color:#69768a}.title{text-align:right}.title h1{margin:0;font-size:27px;letter-spacing:.06em}.title strong{font-size:14px}.status{display:inline-block;margin-top:5px;padding:3px 8px;border:1px solid #cbd5e1;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase}.status.posted{color:#168255;border-color:#a7d8c2}.status.voided{color:#ce4444;border-color:#e7b0b0}.void{margin:14px 0 -2px;padding:7px;border:2px solid #ce4444;color:#ce4444;text-align:center;font-size:18px;font-weight:900;letter-spacing:.2em}.details{display:grid;grid-template-columns:1.25fr 1fr;gap:28px;margin:20px 0}.details h2{margin:0 0 6px;color:#69768a;font-size:9px;letter-spacing:.12em;text-transform:uppercase}.details p{margin:0}.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}.meta dt{color:#69768a}.meta dd{margin:0;text-align:right;font-weight:700}table{width:100%;border-collapse:collapse}th{padding:7px 8px;border-bottom:1px solid #9aa6b5;color:#566276;font-size:9px;letter-spacing:.08em;text-align:left;text-transform:uppercase}td{padding:9px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.number{text-align:right;font-variant-numeric:tabular-nums}tfoot td{border:0}.grand td{padding-top:12px;border-top:2px solid #172033;font-size:15px}.notes{margin-top:18px;padding:10px 12px;border:1px solid #dbe2e8;border-radius:5px;background:#f7f9fa}.notes strong{display:block;margin-bottom:3px;font-size:10px;text-transform:uppercase}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-top:54px}.signature{padding-top:6px;border-top:1px solid #69768a;text-align:center;color:#69768a}.footer{margin-top:32px;padding-top:10px;border-top:1px solid #dbe2e8;color:#69768a;font-size:10px;text-align:center}.paper-a5{font-size:10.5px}.paper-a5 .top{gap:14px;padding-bottom:12px}.paper-a5 .details{gap:16px;margin:14px 0}.paper-a5 td{padding:6px 5px}.paper-a5 .signatures{margin-top:38px}.thermal{width:100%;font-size:9px;line-height:1.32;overflow-wrap:anywhere}.thermal .top{display:block;padding-bottom:7px;text-align:center}.thermal .brand{justify-content:center;gap:6px}.thermal .mark{width:28px;height:28px}.thermal .brand strong{font-size:13px}.thermal .top>div>p{margin:5px 0 0}.thermal .title{margin-top:7px;text-align:center}.thermal .title h1{font-size:14px}.thermal .title strong{font-size:10px}.thermal .status{padding:1px 5px;font-size:7px}.thermal .void{margin:6px 0;padding:3px;font-size:12px}.thermal .details{display:block;margin:8px 0}.thermal .details>div{padding-bottom:6px;border-bottom:1px dashed #9aa6b5}.thermal .meta{gap:2px 5px;margin:6px 0 0}.thermal table,.thermal thead,.thermal tbody,.thermal tfoot,.thermal tr,.thermal td{display:block}.thermal thead{display:none}.thermal tbody tr{display:grid;grid-template-columns:1fr auto;padding:5px 0;border-bottom:1px dashed #cbd5e1}.thermal td{padding:1px 0;border:0}.thermal .item-index{display:none}.thermal .item-product{grid-column:1/-1}.thermal .item-sold,.thermal .item-foc,.thermal .item-price,.thermal .item-amount{display:flex;grid-column:1/-1;justify-content:space-between;gap:5px;text-align:left}.thermal .item-sold:before,.thermal .item-foc:before,.thermal .item-price:before,.thermal .item-amount:before{content:attr(data-label);color:#69768a}.thermal tfoot{padding-top:5px}.thermal tfoot tr{display:grid;grid-template-columns:1fr auto}.thermal tfoot td{display:none}.thermal tfoot td:nth-last-child(-n+2){display:block}.thermal .grand td{padding-top:5px;border-top:1px solid #172033;font-size:11px}.thermal .notes{margin-top:7px;padding:5px;border-radius:0}.thermal .signatures{gap:12px;margin-top:26px;font-size:7px}.thermal .footer{margin-top:14px;padding-top:6px;font-size:7px}.paper-50mm{font-size:8px}.paper-50mm .mark{display:none}.paper-50mm .brand strong{font-size:12px}.paper-50mm .title h1{font-size:12px}.paper-50mm .signatures{gap:7px;font-size:6px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media screen and (max-width:600px){.page-sheet .details{grid-template-columns:1fr}.page-sheet .top{align-items:flex-start}.page-sheet .title h1{font-size:21px}}
</style></head><body><main class="paper-${paperSize} ${thermal ? 'thermal' : 'page-sheet'}">
<header class="top"><div><div class="brand"><span class="mark">${branding.logo_url ? `<img alt="" src="${escapeHtml(branding.logo_url)}">` : 'SF'}</span><span><strong>${escapeHtml(branding.business_name)}</strong><small>${escapeHtml(t(branding.business_tagline || 'Inventory & Sales'))}</small></span></div>${businessContact ? `<p class="muted">${businessContact}</p>` : ''}</div><div class="title"><h1>${escapeHtml(t('INVOICE'))}</h1><strong>${escapeHtml(sale.reference)}</strong><span class="status ${escapeHtml(sale.status)}">${escapeHtml(t(sale.status))}</span></div></header>
${sale.status === 'voided' ? `<div class="void">${escapeHtml(t('VOID'))}</div>` : ''}
<section class="details"><div><h2>${escapeHtml(t('Bill to'))}</h2><p><strong>${escapeHtml(sale.customer.name)}</strong><br><span class="muted">${escapeHtml(sale.customer.code)}${contact ? `<br>${contact}` : ''}</span></p></div><dl class="meta"><dt>${escapeHtml(t('Invoice date'))}</dt><dd>${escapeHtml(dateTime(issuedAt, locale))}</dd><dt>${escapeHtml(t('Payment'))}</dt><dd>${escapeHtml(`${locale === 'en' ? sale.payment_type.toUpperCase() : t(sale.payment_type)}${sale.payment_method_name ? ` · ${sale.payment_method_name}` : ''}`)}</dd><dt>${escapeHtml(t('Representative'))}</dt><dd>${escapeHtml(sale.representative.name)} (${escapeHtml(sale.representative.code)})</dd><dt>${escapeHtml(t('Coverage'))}</dt><dd>${escapeHtml(sale.region?.name || sale.warehouse.name)}</dd></dl></section>
<table><thead><tr><th class="number">#</th><th>${escapeHtml(t('Product'))}</th><th class="number">${escapeHtml(t('Sold'))}</th><th class="number">FOC</th><th class="number">${escapeHtml(t('Unit price'))}</th><th class="number">${escapeHtml(t('Discount'))}</th><th class="number">${escapeHtml(t('Amount'))}</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="5"></td><td class="number">${escapeHtml(t('Gross'))}</td><td class="number"><strong>${escapeHtml(money(sale.gross_amount ?? (sale.merchandise_subtotal ?? sale.total_amount) + (sale.total_discount ?? 0)))}</strong></td></tr><tr><td colspan="5"></td><td class="number">${escapeHtml(t('Item discounts'))}</td><td class="number"><strong>-${escapeHtml(money(sale.total_discount ?? 0))}</strong></td></tr><tr><td colspan="5"></td><td class="number">${escapeHtml(sale.promotion_title || t('Promotion cashback'))}</td><td class="number"><strong>-${escapeHtml(money(sale.promotion_amount ?? 0))}</strong></td></tr><tr><td colspan="5"></td><td class="number">${escapeHtml(t('Cashback amount'))}</td><td class="number"><strong>-${escapeHtml(money(sale.total_cashback ?? 0))}</strong></td></tr><tr><td colspan="5"></td><td class="number">${escapeHtml(t('Item promotions'))}</td><td class="number"><strong>-${escapeHtml(money(sale.total_item_promotion ?? 0))}</strong></td></tr><tr class="grand"><td colspan="5"></td><td class="number"><strong>${escapeHtml(t('Payable total'))}</strong></td><td class="number"><strong>${escapeHtml(money(sale.total_amount))}</strong></td></tr></tfoot></table>
${sale.notes ? `<section class="notes"><strong>${escapeHtml(t('Notes'))}</strong>${escapeHtml(sale.notes)}</section>` : ''}${sale.void_reason ? `<section class="notes"><strong>${escapeHtml(t('Void reason'))}</strong>${escapeHtml(sale.void_reason)}</section>` : ''}
<section class="signatures"><div class="signature">${escapeHtml(t('Customer signature'))}</div><div class="signature">${escapeHtml(t('Authorized signature'))}</div></section><footer class="footer">${escapeHtml(branding.invoice_footer || t('Thank you for your business'))} · ${escapeHtml(t('Generated from'))} ${escapeHtml(branding.business_name)}</footer>
</main></body></html>`;
}

export function printInvoice(
    sale: Sale,
    branding?: Branding,
    paperSize: InvoicePaperSize = 'a4',
    locale: AppLocale = 'en',
) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(invoiceDocument(sale, branding, paperSize, locale));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 150);
    return true;
}

export function invoiceBatchDocument(
    sales: Sale[],
    branding: Branding = fallbackBranding,
    locale: AppLocale = 'en',
) {
    const documents = sales.map((sale) => invoiceDocument(sale, branding, 'a5', locale));
    const sharedStyles = documents[0]?.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const invoices = documents
        .map((document) => document.match(/<main[\s\S]*?<\/main>/)?.[0] ?? '')
        .join('');

    return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>Invoices</title><style>${sharedStyles}
    @page{size:A5;margin:10mm}.invoice-batch>main{break-after:page;page-break-after:always}.invoice-batch>main:last-child{break-after:auto;page-break-after:auto}
    </style></head><body class="invoice-batch">${invoices}</body></html>`;
}

export function printInvoicesA5(
    sales: Sale[],
    branding?: Branding,
    locale: AppLocale = 'en',
    targetWindow?: Window | null,
) {
    const printWindow = targetWindow ?? window.open('', '_blank');
    if (!printWindow) return false;
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(invoiceBatchDocument(sales, branding, locale));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 200);
    return true;
}
