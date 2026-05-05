import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const compoundStagnation: Detector = async (ctx) => {
  if (ctx.currentPhase !== 4) return []
  const snap = await adminDb
    .collection('seo_audits')
    .where('sprintId', '==', ctx.sprintId)
    .where('deleted', '==', false)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audits = snap.docs.map((d) => d.data() as any).sort((a, b) => (a.snapshotDay ?? 0) - (b.snapshotDay ?? 0))
  if (audits.length < 5) return []
  const last5 = audits.slice(-5)
  const deltas = []
  for (let i = 1; i < last5.length; i++) {
    const prev = last5[i - 1].traffic?.impressions ?? 0
    const curr = last5[i].traffic?.impressions ?? 0
    deltas.push(prev > 0 ? (curr - prev) / prev : 0)
  }
  const allFlat = deltas.every((d) => Math.abs(d) < 0.05)
  if (allFlat) {
    return [
      {
        type: 'compound_stagnation' as const,
        severity: 'medium' as const,
        evidence: { recentDeltas: deltas },
      },
    ]
  }
  return []
}
