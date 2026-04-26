// lib/metrics/query.ts
//
// Read-side helpers for the metrics fact table. Reports and the portal call
// these — never query Firestore directly.

import { adminDb } from '@/lib/firebase/admin'
import type { Metric, MetricKind, MetricSource } from '@/lib/metrics/types'
import { METRICS_COLLECTION } from '@/lib/metrics/write'

export interface MetricQuery {
  orgId: string
  propertyId?: string
  source?: MetricSource | MetricSource[]
  metric?: MetricKind | MetricKind[]
  dimension?: string
  dimensionValue?: string
  /** Inclusive both ends. */
  from: string // 'YYYY-MM-DD'
  to: string // 'YYYY-MM-DD'
}

/** Raw rows in `date asc` order — caller does aggregation. */
export async function listMetrics(q: MetricQuery): Promise<Metric[]> {
  let ref: FirebaseFirestore.Query = adminDb
    .collection(METRICS_COLLECTION)
    .where('orgId', '==', q.orgId)
    .where('date', '>=', q.from)
    .where('date', '<=', q.to)

  if (q.propertyId) ref = ref.where('propertyId', '==', q.propertyId)

  if (q.source) {
    if (Array.isArray(q.source)) {
      if (q.source.length > 0 && q.source.length <= 10) {
        ref = ref.where('source', 'in', q.source)
      }
    } else {
      ref = ref.where('source', '==', q.source)
    }
  }

  if (q.metric) {
    if (Array.isArray(q.metric)) {
      if (q.metric.length > 0 && q.metric.length <= 10) {
        ref = ref.where('metric', 'in', q.metric)
      }
    } else {
      ref = ref.where('metric', '==', q.metric)
    }
  }

  if (q.dimension) ref = ref.where('dimension', '==', q.dimension)
  if (q.dimensionValue) ref = ref.where('dimensionValue', '==', q.dimensionValue)

  ref = ref.orderBy('date', 'asc')

  const snap = await ref.get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Metric, 'id'>) }))
}

/** Sum `valueZar` across a window for a metric kind. Returns 0 when no rows. */
export async function sumZar(q: MetricQuery): Promise<number> {
  const rows = await listMetrics(q)
  return rows.reduce((acc, r) => acc + (r.valueZar ?? 0), 0)
}

/** Sum native-currency `value` across a window. */
export async function sumValue(q: MetricQuery): Promise<number> {
  const rows = await listMetrics(q)
  return rows.reduce((acc, r) => acc + r.value, 0)
}

/** Get the LAST value for a metric (e.g. active_subs is stock, not flow). */
export async function lastValue(q: MetricQuery): Promise<number | null> {
  const rows = await listMetrics(q)
  if (rows.length === 0) return null
  return rows[rows.length - 1].value
}

export interface DailySeries {
  date: string
  value: number
  valueZar: number | null
}

/** Daily series — one point per date, summed across all dimensions/properties. */
export async function dailySeries(q: MetricQuery): Promise<DailySeries[]> {
  const rows = await listMetrics(q)
  const byDate = new Map<string, DailySeries>()
  for (const r of rows) {
    const cur = byDate.get(r.date) ?? { date: r.date, value: 0, valueZar: 0 }
    cur.value += r.value
    cur.valueZar = (cur.valueZar ?? 0) + (r.valueZar ?? 0)
    byDate.set(r.date, cur)
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

/** Period-over-period delta. Both windows must be the same length in days. */
export async function periodDelta(input: {
  orgId: string
  propertyId?: string
  metric: MetricKind
  source?: MetricSource
  current: { from: string; to: string }
  previous: { from: string; to: string }
}): Promise<{ current: number; previous: number; absolute: number; pct: number | null }> {
  const [current, previous] = await Promise.all([
    sumZar({ ...input, ...input.current }),
    sumZar({ ...input, ...input.previous }),
  ])
  const absolute = current - previous
  const pct = previous === 0 ? null : (absolute / previous) * 100
  return { current, previous, absolute, pct }
}
