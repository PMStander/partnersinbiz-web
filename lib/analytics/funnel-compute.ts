import type { FunnelStep, FunnelWindow, FunnelResults } from './types'
import { WINDOW_MS as WMS } from './types'

interface RawEvent {
  event: string
  distinctId: string
  sessionId: string
  timestamp: number
}

export function computeFunnelResults(
  events: RawEvent[],
  steps: FunnelStep[],
  window: FunnelWindow,
): FunnelResults {
  if (steps.length === 0) {
    return { steps: [], totalEntered: 0, totalConverted: 0 }
  }

  // Group events by distinctId, sorted by timestamp
  const byUser = new Map<string, RawEvent[]>()
  for (const e of events) {
    const arr = byUser.get(e.distinctId) ?? []
    arr.push(e)
    byUser.set(e.distinctId, arr)
  }
  for (const arr of byUser.values()) arr.sort((a, b) => a.timestamp - b.timestamp)

  const windowMs = window !== 'session' ? WMS[window] : Infinity

  const stepCounts = new Array(steps.length).fill(0)

  for (const userEvents of byUser.values()) {
    let stepIdx = 0
    let lastStepTime = 0
    let lastSessionId = ''

    for (const ev of userEvents) {
      if (stepIdx >= steps.length) break
      // FunnelStep.filters is reserved for a future property-filter pass; not yet implemented
      if (ev.event !== steps[stepIdx].event) continue

      if (stepIdx === 0) {
        lastStepTime = ev.timestamp
        lastSessionId = ev.sessionId
        stepCounts[0]++
        stepIdx++
      } else if (window === 'session') {
        if (ev.sessionId === lastSessionId) {
          lastStepTime = ev.timestamp
          stepCounts[stepIdx]++
          stepIdx++
        }
      } else {
        if (ev.timestamp - lastStepTime <= windowMs) {
          lastStepTime = ev.timestamp
          lastSessionId = ev.sessionId
          stepCounts[stepIdx]++
          stepIdx++
        }
      }
    }
  }

  const resultSteps = steps.map((s, i) => ({
    event: s.event,
    count: stepCounts[i],
    conversionFromPrev: i === 0
      ? null
      : stepCounts[i - 1] > 0
        ? Math.round((stepCounts[i] / stepCounts[i - 1]) * 10000) / 100
        : 0,
  }))

  return {
    steps: resultSteps,
    totalEntered: stepCounts[0],
    totalConverted: stepCounts[steps.length - 1],
  }
}
