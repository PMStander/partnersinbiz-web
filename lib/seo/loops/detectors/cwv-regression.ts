import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const cwvRegression: Detector = async (ctx) => {
  const snap = await adminDb.collection('seo_sprints').doc(ctx.sprintId).collection('page_health').get()
  const out = []
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = d.data() as any
    const lcp = p.lcp ?? 0
    const cls = p.cls ?? 0
    if (lcp > 2500 || cls > 0.1) {
      out.push({
        type: 'cwv_regression' as const,
        severity: lcp > 4000 || cls > 0.25 ? ('high' as const) : ('medium' as const),
        evidence: { url: decodeURIComponent(d.id), lcp, cls },
      })
    }
  }
  return out
}
