import { adminDb } from '@/lib/firebase/admin'
import type { Detector } from './index'

export const directorySilence: Detector = async (ctx) => {
  const snap = await adminDb
    .collection('seo_backlinks')
    .where('sprintId', '==', ctx.sprintId)
    .where('status', '==', 'submitted')
    .get()
  const out = []
  const thirtyDaysAgoMs = Date.now() - 30 * 86_400_000
  for (const d of snap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = d.data() as any
    if (!b.submittedAt) continue
    if (new Date(b.submittedAt).getTime() < thirtyDaysAgoMs) {
      out.push({
        type: 'directory_silence' as const,
        severity: 'low' as const,
        evidence: { source: b.source, submittedAt: b.submittedAt, backlinkId: d.id },
      })
    }
  }
  return out
}
