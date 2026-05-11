// lib/email-analytics/range.ts
import type { DateRange } from './aggregate'

/**
 * Parse an ISO `from` and `to` from a URL's searchParams. Defaults to the
 * last 30 days when missing. Returns null when explicitly invalid.
 */
export function parseDateRange(searchParams: URLSearchParams): DateRange | null {
  const fromStr = searchParams.get('from')
  const toStr = searchParams.get('to')

  const now = new Date()
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const from = fromStr ? new Date(fromStr) : defaultFrom
  const to = toStr ? new Date(toStr) : now

  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null
  if (to.getTime() <= from.getTime()) return null

  return { from, to }
}
