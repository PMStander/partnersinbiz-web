import type { Currency } from './types'

const CURRENCY_LOCALES: Record<Currency, string> = {
  USD: 'en-US',
  EUR: 'de-DE',
  ZAR: 'en-ZA',
}

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] || 'en-US', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function currencySymbol(currency: Currency): string {
  const formatted = formatCurrency(0, currency)
  return formatted.replace(/[\d.,\s]/g, '').trim()
}
