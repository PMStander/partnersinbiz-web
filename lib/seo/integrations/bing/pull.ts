import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { fetchInboundLinks } from './client'

export async function pullDailyBingForSprint(sprintId: string): Promise<void> {
  const sprintRef = adminDb.collection('seo_sprints').doc(sprintId)
  const snap = await sprintRef.get()
  if (!snap.exists) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprint = snap.data() as any
  const bing = sprint.integrations?.bing
  if (!bing?.connected || !bing?.siteUrl) return

  let links: { url: string; sourceUrl: string; anchorText: string }[] = []
  try {
    links = await fetchInboundLinks(bing.siteUrl)
  } catch {
    await sprintRef.update({ 'integrations.bing.tokenStatus': 'expired' })
    return
  }

  for (const l of links) {
    if (!l.sourceUrl) continue
    const existing = await adminDb
      .collection('seo_backlinks')
      .where('sprintId', '==', sprintId)
      .where('source', '==', l.sourceUrl)
      .limit(1)
      .get()
    if (!existing.empty) continue
    let domain = ''
    try {
      domain = new URL(l.sourceUrl).hostname
    } catch {
      continue
    }
    await adminDb.collection('seo_backlinks').add({
      sprintId,
      orgId: sprint.orgId,
      source: l.sourceUrl,
      domain,
      type: 'organic',
      status: 'live',
      liveAt: new Date().toISOString(),
      url: l.sourceUrl,
      notes: l.anchorText ? `Anchor: ${l.anchorText}` : undefined,
      discoveredVia: 'bing-wmt',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: 'system',
      createdByType: 'system',
      deleted: false,
    })
  }
  await sprintRef.update({ 'integrations.bing.lastPullAt': FieldValue.serverTimestamp() })
}
