import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const zeroImpressionPost: Detector = async (ctx) => {
  const snap = await adminDb
    .collection('seo_content')
    .where('sprintId', '==', ctx.sprintId)
    .where('status', '==', 'live')
    .get()
  const out = []
  const fourteenDaysAgoMs = Date.now() - 14 * 86_400_000
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = d.data() as any
    if (!c.publishDate) continue
    const publishedMs = new Date(c.publishDate).getTime()
    if (publishedMs > fourteenDaysAgoMs) continue
    const impressions = c.performance?.impressions ?? 0
    if (impressions < 5) {
      out.push({
        type: 'zero_impression_post' as const,
        severity: 'medium' as const,
        evidence: { contentId: d.id, title: c.title, publishDate: c.publishDate, impressions },
      })
    }
  }
  return out
}
