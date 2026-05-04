import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const stuckPage: Detector = async (ctx) => {
  const snap = await adminDb
    .collection('seo_keywords')
    .where('sprintId', '==', ctx.sprintId)
    .where('deleted', '==', false)
    .get()
  const out = []
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = d.data() as any
    const recent = (k.positions ?? []).slice(-3)
    if (recent.length < 3) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allInBand = recent.every((p: any) => p.position >= 8 && p.position <= 22)
    const noImprovement = recent[0].position - recent[recent.length - 1].position < 2
    if (allInBand && noImprovement) {
      out.push({
        type: 'stuck_page' as const,
        severity: 'medium' as const,
        evidence: {
          keyword: k.keyword,
          keywordId: d.id,
          targetPageUrl: k.targetPageUrl,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          recentPositions: recent.map((r: any) => r.position),
        },
      })
    }
  }
  return out
}
