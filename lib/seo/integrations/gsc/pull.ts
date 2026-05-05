import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { refreshGscClient } from './auth'
import { fetchSearchAnalytics } from './client'
import { decryptCredentials } from '@/lib/integrations/crypto'

function dateNDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

export async function pullDailyGscForSprint(sprintId: string): Promise<void> {
  const sprintRef = adminDb.collection('seo_sprints').doc(sprintId)
  const snap = await sprintRef.get()
  if (!snap.exists) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sprint = snap.data() as any
  const gsc = sprint.integrations?.gsc
  if (!gsc?.connected || !gsc?.propertyUrl || !gsc?.tokens) return

  let refreshToken: string | undefined
  try {
    const decrypted = decryptCredentials<{ refresh_token?: string }>(gsc.tokens, sprint.orgId)
    refreshToken = decrypted.refresh_token
  } catch {
    await sprintRef.update({ 'integrations.gsc.tokenStatus': 'expired' })
    return
  }
  if (!refreshToken) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const auth = refreshGscClient(refreshToken) as any
  let rows
  try {
    rows = await fetchSearchAnalytics(auth, gsc.propertyUrl, dateNDaysAgo(8), dateNDaysAgo(1))
  } catch {
    await sprintRef.update({ 'integrations.gsc.tokenStatus': 'expired' })
    return
  }

  const keywordsSnap = await adminDb.collection('seo_keywords').where('sprintId', '==', sprintId).get()
  const batch = adminDb.batch()
  const now = new Date().toISOString()
  for (const doc of keywordsSnap.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = doc.data() as any
    const matches = rows.filter((r) => r.query.toLowerCase() === k.keyword.toLowerCase())
    if (matches.length === 0) continue
    const agg = matches.reduce(
      (a, r) => ({
        impressions: a.impressions + r.impressions,
        clicks: a.clicks + r.clicks,
        position: a.position + r.position * r.impressions,
      }),
      { impressions: 0, clicks: 0, position: 0 },
    )
    const avgPosition = agg.impressions > 0 ? agg.position / agg.impressions : 0
    const ctr = agg.impressions > 0 ? agg.clicks / agg.impressions : 0
    const newPosition = {
      pulledAt: now,
      position: avgPosition,
      source: 'gsc',
      impressions: agg.impressions,
      clicks: agg.clicks,
      ctr,
    }
    batch.update(doc.ref, {
      positions: FieldValue.arrayUnion(newPosition),
      currentPosition: avgPosition,
      currentImpressions: agg.impressions,
      currentClicks: agg.clicks,
      currentCtr: ctr,
      status:
        avgPosition > 0 && avgPosition <= 3
          ? 'top_3'
          : avgPosition > 0 && avgPosition <= 10
            ? 'top_10'
            : avgPosition > 0 && avgPosition <= 100
              ? 'ranking'
              : 'not_yet',
    })
  }
  await batch.commit()
  await sprintRef.update({
    'integrations.gsc.lastPullAt': FieldValue.serverTimestamp(),
    'integrations.gsc.tokenStatus': 'valid',
  })
}
