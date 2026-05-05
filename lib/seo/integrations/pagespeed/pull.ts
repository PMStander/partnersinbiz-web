import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { runPageSpeed } from './client'

export async function pullDailyPagespeedForSprint(sprintId: string): Promise<void> {
  const sprintRef = adminDb.collection('seo_sprints').doc(sprintId)
  const snap = await sprintRef.get()
  if (!snap.exists) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprint = snap.data() as any
  if (!sprint.integrations?.pagespeed?.enabled) return

  const tracked: string[] = [sprint.siteUrl]
  const pagesSnap = await adminDb.collection('seo_keywords').where('sprintId', '==', sprintId).limit(20).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const targets = pagesSnap.docs.map((d) => (d.data() as any).targetPageUrl).filter(Boolean) as string[]
  if (targets.length > 0) {
    const day = Math.floor(Date.now() / 86_400_000) % targets.length
    for (let i = 0; i < 3 && i < targets.length; i++) tracked.push(targets[(day + i) % targets.length])
  }

  for (const url of tracked) {
    try {
      const r = await runPageSpeed(url)
      await sprintRef
        .collection('page_health')
        .doc(encodeURIComponent(url))
        .set({ ...r, lastPulledAt: FieldValue.serverTimestamp() }, { merge: true })
    } catch {
      // continue per-URL
    }
  }
  await sprintRef.update({ 'integrations.pagespeed.lastPullAt': FieldValue.serverTimestamp() })
}
