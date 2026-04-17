import type { RetentionGranularity, RetentionResult, RetentionCohortRow } from './types'

interface RawEvent {
  distinctId: string
  event: string
  timestamp: number
}

function periodFloor(ts: number, granularity: RetentionGranularity): number {
  const d = new Date(ts)
  if (granularity === 'day') {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  // ISO week: Monday-aligned
  const day = d.getUTCDay() || 7
  const monday = ts - (day - 1) * 86400000
  const m = new Date(monday)
  return Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate())
}

function periodLabel(ts: number, granularity: RetentionGranularity): string {
  const d = new Date(ts)
  if (granularity === 'day') {
    return d.toISOString().slice(0, 10)
  }
  // ISO 8601 week: Thursday-based. The year of the week belongs to the year
  // that contains the Thursday of that week.
  const thursday = new Date(ts)
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3)
  const isoYear = thursday.getUTCFullYear()
  const jan4 = Date.UTC(isoYear, 0, 4)
  const weekNum = Math.round((thursday.getTime() - jan4) / 604800000) + 1
  return `${isoYear}-W${String(weekNum).padStart(2, '0')}`
}

export function computeRetention(
  events: RawEvent[],
  cohortEvent: string,
  returnEvent: string,
  granularity: RetentionGranularity,
  fromMs: number,
  toMs: number,
): RetentionResult {
  const periodMs = granularity === 'day' ? 86400000 : 7 * 86400000

  // Build cohorts: map from cohortPeriodStart → Set<distinctId>
  const cohorts = new Map<number, Set<string>>()
  // Track each user's cohort period
  const userCohortPeriod = new Map<string, number>()

  for (const ev of events) {
    if (ev.event !== cohortEvent) continue
    if (ev.timestamp < fromMs || ev.timestamp >= toMs) continue
    const period = periodFloor(ev.timestamp, granularity)
    if (!userCohortPeriod.has(ev.distinctId)) {
      userCohortPeriod.set(ev.distinctId, period)
      const bucket = cohorts.get(period) ?? new Set()
      bucket.add(ev.distinctId)
      cohorts.set(period, bucket)
    }
  }

  if (cohorts.size === 0) {
    return { granularity, cohortEvent, returnEvent, maxPeriods: 0, rows: [] }
  }

  // Determine max periods we can compute
  let minCohortStart = Infinity
  for (const k of cohorts.keys()) if (k < minCohortStart) minCohortStart = k
  const maxPeriods = Math.max(1, Math.floor((toMs - minCohortStart) / periodMs) + 1)

  // Build return event map: distinctId → Set<returnPeriod offset>
  const userReturns = new Map<string, Set<number>>()
  for (const ev of events) {
    if (ev.event !== returnEvent) continue
    const cohortPeriod = userCohortPeriod.get(ev.distinctId)
    if (cohortPeriod === undefined) continue
    const evPeriod = periodFloor(ev.timestamp, granularity)
    const periodOffset = Math.round((evPeriod - cohortPeriod) / periodMs)
    if (periodOffset < 0) continue
    const set = userReturns.get(ev.distinctId) ?? new Set()
    set.add(periodOffset)
    userReturns.set(ev.distinctId, set)
  }

  const rows: RetentionCohortRow[] = []

  for (const [cohortStart, users] of [...cohorts.entries()].sort(([a], [b]) => a - b)) {
    const cohortSize = users.size
    const availablePeriods = Math.floor((toMs - cohortStart) / periodMs) + 1
    const periods: (number | null)[] = []

    for (let p = 0; p < maxPeriods; p++) {
      if (p >= availablePeriods) {
        periods.push(null)
        continue
      }
      if (p === 0) {
        periods.push(100)
        continue
      }
      let returned = 0
      for (const uid of users) {
        if (userReturns.get(uid)?.has(p)) returned++
      }
      periods.push(Math.round((returned / cohortSize) * 100))
    }

    rows.push({
      cohortLabel: periodLabel(cohortStart, granularity),
      cohortStart,
      cohortSize,
      periods,
    })
  }

  return { granularity, cohortEvent, returnEvent, maxPeriods, rows }
}
