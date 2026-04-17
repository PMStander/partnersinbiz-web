import { computeRetention } from '@/lib/analytics/retention-compute'

const DAY = 86400000

const baseEvents = [
  // user-A: cohort event day 0, return event day 1
  { distinctId: 'u-a', event: 'signup', timestamp: 0 },
  { distinctId: 'u-a', event: 'pageview', timestamp: DAY },
  // user-B: cohort event day 0, no return
  { distinctId: 'u-b', event: 'signup', timestamp: DAY / 2 },
  // user-C: NOT in cohort (fires pageview only)
  { distinctId: 'u-c', event: 'pageview', timestamp: DAY * 2 },
]

describe('computeRetention', () => {
  it('produces one cohort row for day-granularity', () => {
    const result = computeRetention(baseEvents, 'signup', 'pageview', 'day', 0, DAY * 3)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].cohortSize).toBe(2)
  })

  it('period 0 is always 100', () => {
    const result = computeRetention(baseEvents, 'signup', 'pageview', 'day', 0, DAY * 3)
    expect(result.rows[0].periods[0]).toBe(100)
  })

  it('period 1 is 50% when one of two users returns', () => {
    const result = computeRetention(baseEvents, 'signup', 'pageview', 'day', 0, DAY * 3)
    expect(result.rows[0].periods[1]).toBe(50)
  })

  it('returns empty rows when no cohort events exist', () => {
    const result = computeRetention([], 'signup', 'pageview', 'day', 0, DAY * 3)
    expect(result.rows).toHaveLength(0)
  })
})
