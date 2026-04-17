import { computeFunnelResults } from '@/lib/analytics/funnel-compute'
import type { FunnelStep } from '@/lib/analytics/types'

const steps: FunnelStep[] = [
  { event: 'page_view' },
  { event: 'test_started' },
  { event: 'share_clicked' },
]

function makeEvent(event: string, distinctId: string, sessionId: string, offsetMs = 0) {
  return { event, distinctId, sessionId, timestamp: 1000 + offsetMs }
}

describe('computeFunnelResults', () => {
  it('counts users who completed all steps', () => {
    const events = [
      makeEvent('page_view', 'u1', 's1', 0),
      makeEvent('test_started', 'u1', 's1', 1000),
      makeEvent('share_clicked', 'u1', 's1', 2000),
      makeEvent('page_view', 'u2', 's2', 0),
      makeEvent('test_started', 'u2', 's2', 1000),
      // u2 never shared
    ]
    const result = computeFunnelResults(events, steps, '24h')
    expect(result.steps[0].count).toBe(2)
    expect(result.steps[1].count).toBe(2)
    expect(result.steps[2].count).toBe(1)
    expect(result.totalEntered).toBe(2)
    expect(result.totalConverted).toBe(1)
    expect(result.steps[2].conversionFromPrev).toBeCloseTo(50)
  })

  it('returns zero counts when no events', () => {
    const result = computeFunnelResults([], steps, '24h')
    expect(result.steps[0].count).toBe(0)
    expect(result.totalEntered).toBe(0)
    expect(result.totalConverted).toBe(0)
  })

  it('respects session window', () => {
    const events = [
      makeEvent('page_view', 'u1', 's1', 0),
      makeEvent('test_started', 'u1', 's2', 0), // different session
    ]
    const result = computeFunnelResults(events, steps, 'session')
    expect(result.steps[0].count).toBe(1)
    expect(result.steps[1].count).toBe(0)  // different sessionId
  })

  it('first step has null conversionFromPrev', () => {
    const events = [makeEvent('page_view', 'u1', 's1', 0)]
    const result = computeFunnelResults(events, steps, '24h')
    expect(result.steps[0].conversionFromPrev).toBeNull()
  })
})
