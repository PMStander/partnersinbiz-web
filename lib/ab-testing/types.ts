// lib/ab-testing/types.ts
//
// Native A/B testing types. Shared between broadcasts (one-time blasts) and
// sequence steps. Variants override email content/from-name/send-time so a
// single "definition" can fan out N concrete sends.
//
// Two modes:
//   - split:        every variant is sent according to its weight; user (or
//                   auto-promote) picks the winner manually afterwards. All
//                   audience receives some variant.
//   - winner-only:  only `testCohortPercent` of the audience receives variants
//                   during a test window. After `testDurationMinutes` we pick
//                   the winner by `winnerMetric` and fan it out to the
//                   remaining (100 - testCohortPercent)% of the audience.
import type { Timestamp } from 'firebase-admin/firestore'

export type VariantOverride =
  | { kind: 'subject'; subject: string }
  | { kind: 'fromName'; fromName: string }
  | { kind: 'body'; subject?: string; bodyHtml: string; bodyText: string }
  | { kind: 'sendTime'; offsetMinutes: number } // applied to scheduledFor

export interface Variant {
  id: string                  // short id (a/b/c/...) — letter-codes
  label: string               // human label, e.g. "Subject A: short"
  overrides: VariantOverride[]
  weight: number              // 0..100 — sums across variants must equal 100 for split mode
  // Per-variant stats (rolled up by webhook + cron)
  sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  unsubscribed: number
}

export type AbMode = 'split' | 'winner-only'
export type AbWinnerMetric = 'opens' | 'clicks' | 'click-through-rate' | 'open-rate'
export type AbStatus = 'inactive' | 'testing' | 'winner-pending' | 'winner-sent' | 'complete'

export interface AbConfig {
  enabled: boolean
  mode: AbMode
  variants: Variant[]
  testCohortPercent: number      // for winner-only: 0..100 (e.g. 20 means 20% sees variants)
  winnerMetric: AbWinnerMetric
  testDurationMinutes: number    // wait this long before declaring winner (e.g. 240 = 4h)
  autoPromote: boolean           // auto-pick winner after testDurationMinutes
  testStartedAt: Timestamp | null
  testEndsAt: Timestamp | null
  winnerVariantId: string        // "" until decided
  winnerDecidedAt: Timestamp | null
  status: AbStatus
}

export const EMPTY_AB: AbConfig = {
  enabled: false,
  mode: 'split',
  variants: [],
  testCohortPercent: 20,
  winnerMetric: 'opens',
  testDurationMinutes: 240,
  autoPromote: true,
  testStartedAt: null,
  testEndsAt: null,
  winnerVariantId: '',
  winnerDecidedAt: null,
  status: 'inactive',
}

/**
 * Factory for a blank variant with stats zeroed. Letter-coded ids (a, b, c, ...).
 */
export function makeVariant(id: string, label = `Variant ${id.toUpperCase()}`, weight = 50): Variant {
  return {
    id,
    label,
    overrides: [],
    weight,
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
  }
}
