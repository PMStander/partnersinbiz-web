// lib/metrics/anomaly.ts
//
// Lightweight anomaly detection for the metrics fact table.
// For each (orgId, propertyId, source, metric) tuple, compares yesterday's
// value against the trailing 14-day median + MAD (median absolute deviation).
// Emits a row in `notifications` and an outbound webhook event for any
// metric whose modified-z-score crosses a configurable threshold.
//
// MAD-based scoring is chosen over plain z-score because revenue metrics are
// heavy-tailed and have outlier days that would otherwise mask real shifts.

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { listMetrics } from '@/lib/metrics/query'
import type { MetricKind } from '@/lib/metrics/types'

const WATCHED: Array<{ metric: MetricKind; minSample: number; threshold: number }> = [
  { metric: 'ad_revenue',           minSample: 7, threshold: 3.5 },
  { metric: 'iap_revenue',          minSample: 7, threshold: 3.5 },
  { metric: 'subscription_revenue', minSample: 7, threshold: 3.5 },
  { metric: 'mrr',                  minSample: 7, threshold: 3.5 },
  { metric: 'active_subs',          minSample: 7, threshold: 3.5 },
  { metric: 'sessions',             minSample: 7, threshold: 4.0 },
  { metric: 'installs',             minSample: 7, threshold: 4.0 },
  { metric: 'churn',                minSample: 7, threshold: 3.5 },
]

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length / 2
  return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2
}

function mad(xs: number[], med: number): number {
  if (xs.length === 0) return 0
  const deviations = xs.map((x) => Math.abs(x - med))
  return median(deviations)
}

/** Modified z-score: 0.6745 × (x − median) / MAD. Robust to outliers. */
function modifiedZ(x: number, baseline: number[]): number {
  if (baseline.length === 0) return 0
  const med = median(baseline)
  const dev = mad(baseline, med)
  if (dev === 0) return 0 // all equal — no anomaly
  return (0.6745 * (x - med)) / dev
}

export interface Anomaly {
  orgId: string
  propertyId: string
  source: string
  metric: MetricKind
  date: string
  value: number
  baselineMedian: number
  modifiedZ: number
  direction: 'up' | 'down'
}

interface DetectInput {
  orgId: string
  /** ISO date 'YYYY-MM-DD' to evaluate (defaults to yesterday). */
  date?: string
}

/** Detect anomalies for a single org. Returns an array of anomaly records. */
export async function detectAnomalies(input: DetectInput): Promise<Anomaly[]> {
  const today = input.date ?? (() => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const fourteenAgo = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 14)
    return d.toISOString().slice(0, 10)
  })()
  const dayBefore = (() => {
    const d = new Date(today + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const findings: Anomaly[] = []

  for (const w of WATCHED) {
    // Pull the trailing 14-day window inclusive of today.
    const rows = await listMetrics({
      orgId: input.orgId,
      metric: w.metric,
      from: fourteenAgo,
      to: today,
    })
    if (rows.length === 0) continue

    // Group by (propertyId, source). Each tuple gets its own baseline.
    const groups = new Map<string, typeof rows>()
    for (const r of rows) {
      const k = `${r.propertyId}|${r.source}`
      const arr = groups.get(k) ?? []
      arr.push(r)
      groups.set(k, arr)
    }

    for (const [key, gRows] of groups) {
      const today_rows = gRows.filter((r) => r.date === today)
      if (today_rows.length === 0) continue

      const baseline = gRows
        .filter((r) => r.date >= fourteenAgo && r.date <= dayBefore)
        .map((r) => r.valueZar ?? r.value)
      if (baseline.length < w.minSample) continue

      const todayValue = today_rows.reduce((acc, r) => acc + (r.valueZar ?? r.value), 0)
      const z = modifiedZ(todayValue, baseline)
      if (Math.abs(z) >= w.threshold) {
        const [propertyId, source] = key.split('|')
        findings.push({
          orgId: input.orgId,
          propertyId,
          source,
          metric: w.metric,
          date: today,
          value: todayValue,
          baselineMedian: median(baseline),
          modifiedZ: z,
          direction: z > 0 ? 'up' : 'down',
        })
      }
    }
  }

  return findings
}

/** Persist + notify for a single anomaly. Idempotent: same anomaly twice writes once. */
export async function recordAnomaly(a: Anomaly): Promise<void> {
  const id = `anomaly_${a.orgId}_${a.propertyId}_${a.source}_${a.metric}_${a.date}`
  const ref = adminDb.collection('notifications').doc(id)
  const exists = await ref.get()
  if (exists.exists) return
  await ref.set({
    id,
    orgId: a.orgId,
    type: 'metric.anomaly',
    severity: Math.abs(a.modifiedZ) > 5 ? 'high' : 'medium',
    title: `${a.direction === 'up' ? '↑' : '↓'} ${a.metric} on ${a.date}`,
    body: `${a.metric} ${a.direction === 'up' ? 'spiked to' : 'dropped to'} ${a.value.toFixed(2)} (baseline median ${a.baselineMedian.toFixed(2)}, modified-z ${a.modifiedZ.toFixed(2)}).`,
    propertyId: a.propertyId,
    source: a.source,
    metric: a.metric,
    date: a.date,
    value: a.value,
    baselineMedian: a.baselineMedian,
    modifiedZ: a.modifiedZ,
    direction: a.direction,
    status: 'unread',
    createdAt: FieldValue.serverTimestamp(),
  })
}
