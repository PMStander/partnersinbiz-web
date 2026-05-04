import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const pillarOrphan: Detector = async (ctx) => {
  const pillarSnap = await adminDb
    .collection('seo_content')
    .where('sprintId', '==', ctx.sprintId)
    .where('type', '==', 'pillar')
    .where('status', '==', 'live')
    .get()
  const out = []
  for (const p of pillarSnap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pillar = p.data() as any
    // Heuristic: count posts with internalLinksAdded that reference the pillar
    const refSnap = await adminDb
      .collection('seo_content')
      .where('sprintId', '==', ctx.sprintId)
      .where('internalLinksAdded', '==', true)
      .get()
    if (refSnap.size < 3) {
      out.push({
        type: 'pillar_orphan' as const,
        severity: 'medium' as const,
        evidence: { contentId: p.id, title: pillar.title, inboundCount: refSnap.size },
      })
    }
  }
  return out
}
