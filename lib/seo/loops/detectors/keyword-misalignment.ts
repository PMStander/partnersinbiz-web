import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

// Heuristic only: if a keyword's positions show low CTR (< 1%) AND impressions > 100,
// it suggests the page surfaces but doesn't satisfy intent — likely misalignment.
export const keywordMisalignment: Detector = async (ctx) => {
  const snap = await adminDb
    .collection('seo_keywords')
    .where('sprintId', '==', ctx.sprintId)
    .where('deleted', '==', false)
    .get()
  const out = []
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = d.data() as any
    const impressions = k.currentImpressions ?? 0
    const ctr = k.currentCtr ?? 0
    if (impressions > 100 && ctr < 0.01) {
      out.push({
        type: 'keyword_misalignment' as const,
        severity: 'medium' as const,
        evidence: { keyword: k.keyword, keywordId: d.id, impressions, ctr, url: k.targetPageUrl },
      })
    }
  }
  return out
}
