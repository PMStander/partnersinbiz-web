import type { HealthSignal } from '@/lib/seo/types'

export interface DetectorContext {
  sprintId: string
  orgId: string
  startDate: string
  currentDay: number
  currentWeek: number
  currentPhase: 0 | 1 | 2 | 3 | 4
}

export type Detector = (ctx: DetectorContext) => Promise<HealthSignal[]>

const detectors: Record<string, Detector> = {}

export function registerDetector(name: string, fn: Detector) {
  detectors[name] = fn
}

export function getDetectors(): Record<string, Detector> {
  return { ...detectors }
}

export async function runAllDetectors(ctx: DetectorContext): Promise<HealthSignal[]> {
  const out: HealthSignal[] = []
  for (const fn of Object.values(detectors)) {
    try {
      out.push(...(await fn(ctx)))
    } catch {
      // fail-soft per detector
    }
  }
  return out
}
