import type { Currency } from './types'

function formatCurrency(amount: number, currency: Currency): string {
  const locales: Record<Currency, string> = { USD: 'en-US', EUR: 'de-DE', ZAR: 'en-ZA' }
  return new Intl.NumberFormat(locales[currency] || 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function formatAddress(addr: any): string {
  if (!addr) return ''
  const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean)
  return parts.join('<br>')
}

/**
 * Generate a print-friendly HTML invoice
 */
export function generateInvoiceHtml(invoice: any): string {
  const currency = (invoice.currency || 'USD') as Currency
  const from = invoice.fromDetails ?? { companyName: 'Partners in Biz' }
  const client = invoice.clientDetails ?? { name: invoice.orgId }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoice.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937; background: white; padding: 0; margin: 0;
    }
    @media print {
      body { padding: 0; margin: 0; }
      .no-print { display: none !important; }
      .invoice-container { padding: 0; }
    }
    .invoice-container { max-width: 850px; margin: 0 auto; padding: 40px; background: white; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #f3f4f6; padding-bottom: 30px; }
    .logo-section { flex: 1; }
    .logo-section img { max-height: 50px; margin-bottom: 10px; }
    .company-name { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 5px; }
    .company-detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
    .invoice-meta { text-align: right; }
    .invoice-number { font-size: 28px; font-weight: 700; color: #059669; margin-bottom: 15px; }
    .meta-row { font-size: 13px; color: #6b7280; margin-bottom: 4px; }
    .addresses { display: flex; gap: 40px; margin-bottom: 40px; }
    .address-block { flex: 1; }
    .section-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 8px; }
    .address-name { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 4px; }
    .address-detail { font-size: 12px; color: #6b7280; line-height: 1.6; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table thead { border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
    .items-table th { padding: 12px 0; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
    .items-table th.amount { text-align: right; }
    .items-table td { padding: 14px 0; font-size: 13px; color: #374151; border-bottom: 1px solid #f3f4f6; }
    .items-table td.amount { text-align: right; font-weight: 600; color: #111827; }
    .items-table tbody tr:last-child td { border-bottom: 1px solid #e5e7eb; }
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 40px; }
    .totals { width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 13px; color: #6b7280; }
    .total-row.subtotal { border-bottom: 1px solid #e5e7eb; }
    .total-row.tax { border-bottom: 1px solid #e5e7eb; }
    .total-row.final { padding: 15px 0; padding-top: 12px; border-top: 2px solid #e5e7eb; font-size: 16px; font-weight: 700; color: #111827; }
    .total-amount { color: #059669; font-weight: 700; }
    .notes-section { margin-bottom: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb; }
    .notes-text { font-size: 13px; color: #6b7280; line-height: 1.6; }
    .banking-section { margin-bottom: 40px; padding: 20px; background: #f9fafb; border-radius: 8px; }
    .banking-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-top: 10px; }
    .banking-row { font-size: 12px; }
    .banking-label { color: #6b7280; }
    .banking-value { color: #111827; font-weight: 500; }
    .footer { text-align: center; padding-top: 30px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${from.logoUrl ? `<img src="${from.logoUrl}" alt="Logo">` : ''}
        <div class="company-name">${from.companyName}</div>
        ${from.website ? `<div class="company-detail">${from.website}</div>` : ''}
        ${from.email ? `<div class="company-detail">${from.email}</div>` : ''}
        ${from.phone ? `<div class="company-detail">${from.phone}</div>` : ''}
        ${from.vatNumber ? `<div class="company-detail">VAT: ${from.vatNumber}</div>` : ''}
        ${from.registrationNumber ? `<div class="company-detail">Reg: ${from.registrationNumber}</div>` : ''}
      </div>
      <div class="invoice-meta">
        <div class="invoice-number">${invoice.invoiceNumber}</div>
        <div class="meta-row"><strong>Issued:</strong> ${formatDate(invoice.issueDate)}</div>
        <div class="meta-row"><strong>Due:</strong> ${formatDate(invoice.dueDate)}</div>
      </div>
    </div>

    <!-- Addresses -->
    <div class="addresses">
      <div class="address-block">
        <div class="section-label">From</div>
        <div class="address-name">${from.companyName}</div>
        ${from.address ? `<div class="address-detail">${formatAddress(from.address)}</div>` : ''}
      </div>
      <div class="address-block">
        <div class="section-label">Bill To</div>
        <div class="address-name">${client.name}</div>
        ${client.address ? `<div class="address-detail">${formatAddress(client.address)}</div>` : ''}
        ${client.email ? `<div class="address-detail">${client.email}</div>` : ''}
        ${client.vatNumber ? `<div class="address-detail">VAT: ${client.vatNumber}</div>` : ''}
      </div>
    </div>

    <!-- Line Items -->
    <div class="line-items">
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left; width: 50%;">Description</th>
            <th style="text-align: center; width: 15%;">Qty</th>
            <th style="text-align: right; width: 17.5%;">Unit Price</th>
            <th class="amount" style="width: 17.5%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.lineItems
            .map(
              (item: any) => `
            <tr>
              <td>${item.description}</td>
              <td style="text-align: center;">${item.quantity}</td>
              <td style="text-align: right;">${formatCurrency(item.unitPrice, currency)}</td>
              <td class="amount">${formatCurrency(item.amount, currency)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals">
        <div class="total-row subtotal">
          <span>Subtotal</span>
          <span>${formatCurrency(invoice.subtotal, currency)}</span>
        </div>
        ${
          invoice.taxRate > 0
            ? `
        <div class="total-row tax">
          <span>Tax (${invoice.taxRate}%)</span>
          <span>${formatCurrency(invoice.taxAmount, currency)}</span>
        </div>
        `
            : ''
        }
        <div class="total-row final">
          <span>Total</span>
          <span class="total-amount">${formatCurrency(invoice.total, currency)}</span>
        </div>
      </div>
    </div>

    <!-- Notes -->
    ${
      invoice.notes
        ? `
    <div class="notes-section">
      <div class="section-label">Notes / Terms</div>
      <div class="notes-text">${invoice.notes}</div>
    </div>
    `
        : ''
    }

    <!-- Banking Details -->
    ${
      from.bankingDetails?.bankName
        ? `
    <div class="banking-section">
      <div class="section-label">Banking Details</div>
      <div class="banking-grid">
        <div class="banking-row"><span class="banking-label">Bank:</span> <span class="banking-value">${from.bankingDetails.bankName}</span></div>
        <div class="banking-row"><span class="banking-label">Account Holder:</span> <span class="banking-value">${from.bankingDetails.accountHolder}</span></div>
        <div class="banking-row"><span class="banking-label">Account Number:</span> <span class="banking-value">${from.bankingDetails.accountNumber}</span></div>
        ${from.bankingDetails.branchCode ? `<div class="banking-row"><span class="banking-label">Branch Code:</span> <span class="banking-value">${from.bankingDetails.branchCode}</span></div>` : ''}
        ${from.bankingDetails.swiftCode ? `<div class="banking-row"><span class="banking-label">SWIFT:</span> <span class="banking-value">${from.bankingDetails.swiftCode}</span></div>` : ''}
        ${from.bankingDetails.iban ? `<div class="banking-row"><span class="banking-label">IBAN:</span> <span class="banking-value">${from.bankingDetails.iban}</span></div>` : ''}
      </div>
    </div>
    `
        : ''
    }

    <!-- Footer -->
    <div class="footer">
      <div>${from.companyName}</div>
      ${from.website ? `<div style="margin-top:4px">${from.website}</div>` : ''}
    </div>
  </div>
</body>
</html>`
}
