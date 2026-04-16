export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

/**
 * Calculate the next due date given an interval and a reference date.
 * Uses UTC to avoid DST edge cases.
 */
export function calculateNextDueAt(interval: RecurrenceInterval, from: Date): Date {
  const d = new Date(from)
  switch (interval) {
    case 'daily':
      d.setUTCDate(d.getUTCDate() + 1)
      break
    case 'weekly':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'monthly':
      d.setUTCMonth(d.getUTCMonth() + 1)
      break
    case 'quarterly':
      d.setUTCMonth(d.getUTCMonth() + 3)
      break
    case 'yearly':
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      break
  }
  return d
}

/**
 * Human-readable label for each interval.
 */
export const INTERVAL_LABELS: Record<RecurrenceInterval, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}
