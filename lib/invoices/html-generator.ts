import type { Invoice, Currency } from './types'

/**
 * Format a currency value using Intl.NumberFormat
 */
function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Format a Firestore timestamp or Date
 */
function formatDate(ts: any): string {
  if (!ts) return '—'
  const d = ts._seconds ? new Date(ts._seconds * 1000) : new Date(ts)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Generate a print-friendly HTML invoice
 */
export function generateInvoiceHtml(
  invoice: any,
  orgName: string = 'Partners in Biz',
  orgLogo: string = ''
): string {
  const currency = (invoice.currency || 'USD') as Currency

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${invoice.invoiceNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937;
      background: white;
      padding: 0;
      margin: 0;
    }

    @media print {
      body {
        padding: 0;
        margin: 0;
      }
      .no-print {
        display: none !important;
      }
    }

    .invoice-container {
      max-width: 850px;
      margin: 0 auto;
      padding: 40px;
      background: white;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      border-bottom: 2px solid #f3f4f6;
      padding-bottom: 30px;
    }

    .logo-section {
      flex: 1;
    }

    .logo-section img {
      max-height: 50px;
      margin-bottom: 10px;
    }

    .company-name {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 5px;
    }

    .company-website {
      font-size: 13px;
      color: #6b7280;
    }

    .invoice-meta {
      text-align: right;
    }

    .invoice-number {
      font-size: 28px;
      font-weight: 700;
      color: #059669;
      margin-bottom: 15px;
    }

    .meta-row {
      font-size: 13px;
      color: #6b7280;
      margin-bottom: 4px;
    }

    /* Bill To Section */
    .bill-to {
      margin-bottom: 40px;
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 8px;
    }

    .bill-to-name {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 4px;
    }

    .bill-to-details {
      font-size: 13px;
      color: #6b7280;
    }

    /* Line Items Table */
    .line-items {
      margin-bottom: 30px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .items-table thead {
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
    }

    .items-table th {
      padding: 12px 0;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      background: transparent;
    }

    .items-table th.amount {
      text-align: right;
    }

    .items-table td {
      padding: 14px 0;
      font-size: 13px;
      color: #374151;
      border-bottom: 1px solid #f3f4f6;
    }

    .items-table td.amount {
      text-align: right;
      font-weight: 600;
      color: #111827;
    }

    .items-table tbody tr:last-child td {
      border-bottom: 1px solid #e5e7eb;
    }

    /* Totals */
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 40px;
    }

    .totals {
      width: 300px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      font-size: 13px;
      color: #6b7280;
    }

    .total-row.subtotal {
      border-bottom: 1px solid #e5e7eb;
    }

    .total-row.tax {
      border-bottom: 1px solid #e5e7eb;
    }

    .total-row.final {
      padding: 15px 0;
      padding-top: 12px;
      border-top: 2px solid #e5e7eb;
      font-size: 16px;
      font-weight: 700;
      color: #111827;
    }

    .total-amount {
      color: #059669;
      font-weight: 700;
    }

    /* Notes */
    .notes-section {
      margin-bottom: 40px;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
    }

    .notes-text {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.6;
    }

    /* Footer */
    .footer {
      text-align: center;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #9ca3af;
    }

    .footer-divider {
      margin: 15px 0;
      color: #d1d5db;
    }

    /* Print button */
    .print-button {
      display: none;
    }

    @media print {
      .print-button {
        display: none !important;
      }
      .invoice-container {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        ${orgLogo ? `<img src="${orgLogo}" alt="Logo">` : ''}
        <div class="company-name">${orgName}</div>
        <div class="company-website">partnersinbiz.online</div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-number">${invoice.invoiceNumber}</div>
        <div class="meta-row"><strong>Issued:</strong> ${formatDate(invoice.issueDate)}</div>
        <div class="meta-row"><strong>Due:</strong> ${formatDate(invoice.dueDate)}</div>
      </div>
    </div>

    <!-- Bill To -->
    <div class="bill-to">
      <div class="section-label">Bill To</div>
      <div class="bill-to-name">${invoice.orgId}</div>
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
      <div class="section-label">Notes</div>
      <div class="notes-text">${invoice.notes}</div>
    </div>
    `
        : ''
    }

    <!-- Footer -->
    <div class="footer">
      <div>${orgName}</div>
      <div class="footer-divider">—</div>
      <div>partnersinbiz.online</div>
    </div>
  </div>
</body>
</html>`
}
