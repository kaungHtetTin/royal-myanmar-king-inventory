import type { Branding } from '../branding/branding-context';
import type { Sale } from './sales';

const escapeHtml = (value: string | number | null | undefined) =>
    String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

const dateTime = (value: string | null) =>
    value
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';

const fallbackBranding: Branding = {
    business_name: 'StockFlow',
    business_tagline: 'Inventory & Sales',
    favicon_url: null,
    logo_url: null,
    primary_color: '#087f74',
};

export function invoiceDocument(sale: Sale, branding: Branding = fallbackBranding) {
    const currency = branding.currency_code ?? 'MMK';
    const money = (value: number) => `${new Intl.NumberFormat('en-US').format(value)} ${currency}`;
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
                <td class="number">${index + 1}</td>
                <td><strong>${escapeHtml(item.product.name)}</strong><small>${escapeHtml(item.product.sku)}</small></td>
                <td class="number">${item.quantity} ${escapeHtml(item.unit?.name ?? item.product.unit)}</td>
                <td class="number">${item.foc_quantity ? `${item.foc_quantity} ${escapeHtml(item.foc_unit?.name ?? item.unit?.name ?? item.product.unit)}` : '—'}</td>
                <td class="number">${escapeHtml(money(item.unit_price))}</td>
                <td class="number"><strong>${escapeHtml(money(item.line_total))}</strong></td>
            </tr>`,
        )
        .join('');

    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice ${escapeHtml(sale.reference)}</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#172033;font:12px/1.45 Inter,"Noto Sans Myanmar",Arial,sans-serif}main{max-width:820px;margin:0 auto}.top{display:flex;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:2px solid ${escapeHtml(branding.primary_color)}}.brand{display:flex;align-items:center;gap:10px}.mark{display:grid;width:38px;height:38px;place-items:center;overflow:hidden;border-radius:6px;color:#fff;background:${escapeHtml(branding.primary_color)};font-weight:800}.mark img{width:100%;height:100%;object-fit:contain;background:#fff}.brand strong{display:block;font-size:20px}.brand small,.muted,small{display:block;color:#69768a}.title{text-align:right}.title h1{margin:0;font-size:27px;letter-spacing:.06em}.title strong{font-size:14px}.status{display:inline-block;margin-top:5px;padding:3px 8px;border:1px solid #cbd5e1;border-radius:999px;font-size:10px;font-weight:800;text-transform:uppercase}.status.posted{color:#168255;border-color:#a7d8c2}.status.voided{color:#ce4444;border-color:#e7b0b0}.void{margin:14px 0 -2px;padding:7px;border:2px solid #ce4444;color:#ce4444;text-align:center;font-size:18px;font-weight:900;letter-spacing:.2em}.details{display:grid;grid-template-columns:1.25fr 1fr;gap:28px;margin:20px 0}.details h2{margin:0 0 6px;color:#69768a;font-size:9px;letter-spacing:.12em;text-transform:uppercase}.details p{margin:0}.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 12px}.meta dt{color:#69768a}.meta dd{margin:0;text-align:right;font-weight:700}table{width:100%;border-collapse:collapse}th{padding:7px 8px;border-bottom:1px solid #9aa6b5;color:#566276;font-size:9px;letter-spacing:.08em;text-align:left;text-transform:uppercase}td{padding:9px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.number{text-align:right;font-variant-numeric:tabular-nums}tfoot td{border:0}.grand td{padding-top:12px;border-top:2px solid #172033;font-size:15px}.notes{margin-top:18px;padding:10px 12px;border:1px solid #dbe2e8;border-radius:5px;background:#f7f9fa}.notes strong{display:block;margin-bottom:3px;font-size:10px;text-transform:uppercase}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:80px;margin-top:54px}.signature{padding-top:6px;border-top:1px solid #69768a;text-align:center;color:#69768a}.footer{margin-top:32px;padding-top:10px;border-top:1px solid #dbe2e8;color:#69768a;font-size:10px;text-align:center}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}@media(max-width:600px){.details{grid-template-columns:1fr}.top{align-items:flex-start}.title h1{font-size:21px}}
</style></head><body><main>
<header class="top"><div><div class="brand"><span class="mark">${branding.logo_url ? `<img alt="" src="${escapeHtml(branding.logo_url)}">` : 'SF'}</span><span><strong>${escapeHtml(branding.business_name)}</strong><small>${escapeHtml(branding.business_tagline || 'Inventory & Sales')}</small></span></div>${businessContact ? `<p class="muted">${businessContact}</p>` : ''}</div><div class="title"><h1>INVOICE</h1><strong>${escapeHtml(sale.reference)}</strong><span class="status ${escapeHtml(sale.status)}">${escapeHtml(sale.status)}</span></div></header>
${sale.status === 'voided' ? '<div class="void">VOID</div>' : ''}
<section class="details"><div><h2>Bill to</h2><p><strong>${escapeHtml(sale.customer.name)}</strong><br><span class="muted">${escapeHtml(sale.customer.code)}${contact ? `<br>${contact}` : ''}</span></p></div><dl class="meta"><dt>Invoice date</dt><dd>${escapeHtml(dateTime(issuedAt))}</dd><dt>Payment</dt><dd>${escapeHtml(sale.payment_type.toUpperCase())}</dd><dt>Representative</dt><dd>${escapeHtml(sale.representative.name)} (${escapeHtml(sale.representative.code)})</dd><dt>Coverage</dt><dd>${escapeHtml([sale.region?.name, sale.way?.name].filter(Boolean).join(' / ') || sale.warehouse.name)}</dd></dl></section>
<table><thead><tr><th class="number">#</th><th>Product</th><th class="number">Sold</th><th class="number">FOC</th><th class="number">Unit price</th><th class="number">Amount</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="4"></td><td class="number">Sold / FOC</td><td class="number"><strong>${sale.total_quantity} / ${sale.total_foc_quantity ?? 0}</strong></td></tr><tr class="grand"><td colspan="4"></td><td class="number"><strong>Total</strong></td><td class="number"><strong>${escapeHtml(money(sale.total_amount))}</strong></td></tr></tfoot></table>
${sale.notes ? `<section class="notes"><strong>Notes</strong>${escapeHtml(sale.notes)}</section>` : ''}${sale.void_reason ? `<section class="notes"><strong>Void reason</strong>${escapeHtml(sale.void_reason)}</section>` : ''}
<section class="signatures"><div class="signature">Customer signature</div><div class="signature">Authorized signature</div></section><footer class="footer">${escapeHtml(branding.invoice_footer || 'Thank you for your business')} · Generated from ${escapeHtml(branding.business_name)}</footer>
</main></body></html>`;
}

export function printInvoice(sale: Sale, branding?: Branding) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;
    printWindow.opener = null;
    printWindow.document.open();
    printWindow.document.write(invoiceDocument(sale, branding));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 150);
    return true;
}
