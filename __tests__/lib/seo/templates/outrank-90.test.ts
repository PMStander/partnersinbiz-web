import { OUTRANK_90 } from '@/lib/seo/templates/outrank-90'

describe('outrank-90 template', () => {
  it('has 42 tasks', () => {
    expect(OUTRANK_90.tasks).toHaveLength(42)
  })
  it('every task has the required fields', () => {
    for (const t of OUTRANK_90.tasks) {
      expect(typeof t.title).toBe('string')
      expect(typeof t.taskType).toBe('string')
      expect(typeof t.week).toBe('number')
      expect([0, 1, 2, 3]).toContain(t.phase)
      expect(typeof t.autopilotEligible).toBe('boolean')
    }
  })
  it('starts in week 0 (pre-launch) and ends in week 13 (Day 90 audit)', () => {
    const weeks = OUTRANK_90.tasks.map((t) => t.week)
    expect(Math.min(...weeks)).toBe(0)
    expect(Math.max(...weeks)).toBe(13)
  })
  it('id is outrank-90 and version is set', () => {
    expect(OUTRANK_90.id).toBe('outrank-90')
    expect(OUTRANK_90.version).toBeGreaterThanOrEqual(1)
  })
})
