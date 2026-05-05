import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const lostKeyword: Detector = async (ctx) => {
  const snap = await adminDb
    .collection('seo_keywords')
    .where('sprintId', '==', ctx.sprintId)
    .where('deleted', '==', false)
    .get()
  const out = []
  const sevenDaysAgoMs = Date.now() - 7 * 86_400_000
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = d.data() as any
    const positions = k.positions ?? []
    if (positions.length < 2) continue
    const latest = positions[positions.length - 1]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const earlier = positions.find((p: any) => new Date(p.pulledAt).getTime() <= sevenDaysAgoMs)
    if (!earlier || !latest) continue
    if (latest.position - earlier.position >= 5) {
      out.push({
        type: 'lost_keyword' as const,
        severity: 'high' as const,
        evidence: {
          keyword: k.keyword,
          keywordId: d.id,
          previousPosition: earlier.position,
          currentPosition: latest.position,
        },
      })
    }
  }
  return out
}
