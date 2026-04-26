// lib/metrics/write.ts
//
// The single way metric rows enter the system. Every adapter, cron job, and
// webhook handler funnels through `writeMetrics`.
//
// Idempotency: the doc id is a hash of
//   (orgId, propertyId, date, source, metric, dimension, dimensionValue)
// so re-running the same pull writes-over the same row instead of duplicating.

import crypto from 'crypto'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Metric, MetricInput } from '@/lib/metrics/types'
import { convertToZar } from '@/lib/fx/rates'

export const METRICS_COLLECTION = 'metrics'

/**
 * Deterministic doc id for a metric row. Stable, short (~16 chars), URL-safe.
 *
 * Exported so tests and callers can reason about identity.
 */
export function metricDocId(input: {
  orgId: string
  propertyId: string
  date: string
  source: string
  metric: string
  dimension?: string | null
  dimensionValue?: string | null
}): string {
  const key = [
    input.orgId,
    input.propertyId,
    input.date,
    input.source,
    input.metric,
    input.dimension ?? '',
    input.dimensionValue ?? '',
  ].join('|')
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
}

/**
 * Write a batch of metric rows. Returns the count actually written.
 * - Computes `valueZar` for any row with a currency.
 * - Writes are upsert (set with merge:false) so the latest value wins.
 * - Batch size auto-chunked at 400 (Firestore limit is 500).
 */
export async function writeMetrics(
  rows: MetricInput[],
  options: { ingestedBy?: Metric['ingestedBy'] } = {},
): Promise<{ written: number }> {
  if (rows.length === 0) return { written: 0 }

  const ingestedBy = options.ingestedBy ?? 'cron'
  const CHUNK = 400
  let written = 0

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const batch = adminDb.batch()

    for (const row of chunk) {
      const id = metricDocId({
        orgId: row.orgId,
        propertyId: row.propertyId,
        date: row.date,
        source: row.source,
        metric: row.metric,
        dimension: row.dimension ?? null,
        dimensionValue: row.dimensionValue ?? null,
      })

      const valueZar =
        row.currency
          ? await convertToZar({
              amount: row.value,
              currency: row.currency,
              date: row.date,
            })
          : null

      const ref = adminDb.collection(METRICS_COLLECTION).doc(id)
      const doc: Omit<Metric, 'id'> = {
        orgId: row.orgId,
        propertyId: row.propertyId,
        date: row.date,
        source: row.source,
        metric: row.metric,
        value: row.value,
        currency: row.currency ?? null,
        valueZar,
        dimension: row.dimension ?? null,
        dimensionValue: row.dimensionValue ?? null,
        raw: row.raw ?? null,
        ingestedAt: FieldValue.serverTimestamp(),
        ingestedBy: row.ingestedBy ?? ingestedBy,
      }
      batch.set(ref, doc)
    }

    await batch.commit()
    written += chunk.length
  }

  return { written }
}

/** Delete a single metric row by composite key. Used in tests / GDPR purge. */
export async function deleteMetric(input: {
  orgId: string
  propertyId: string
  date: string
  source: string
  metric: string
  dimension?: string | null
  dimensionValue?: string | null
}): Promise<void> {
  const id = metricDocId({
    ...input,
    dimension: input.dimension ?? null,
    dimensionValue: input.dimensionValue ?? null,
  })
  await adminDb.collection(METRICS_COLLECTION).doc(id).delete()
}
