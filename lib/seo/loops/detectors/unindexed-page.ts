import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const unindexedPage: Detector = async (ctx) => {
  if (ctx.currentWeek < 2) return []
  const snap = await adminDb
    .collection('seo_keywords')
    .where('sprintId', '==', ctx.sprintId)
    .where('deleted', '==', false)
    .get()
  const out = []
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = d.data() as any
    if (!k.targetPageUrl) continue
    // Heuristic: targetPageUrl with no positions after 2+ weeks is likely unindexed
    if ((k.positions ?? []).length === 0) {
      out.push({
        type: 'unindexed_page' as const,
        severity: 'high' as const,
        evidence: { url: k.targetPageUrl, keyword: k.keyword, keywordId: d.id },
      })
    }
  }
  return out
}
