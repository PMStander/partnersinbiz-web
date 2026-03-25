// app/api/v1/dashboard/email-stats/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest, _user) => {
  const [sentSnap, openedSnap, clickedSnap, failedSnap, contactsSnap] = await Promise.all([
    (adminDb.collection('emails') as any).where('status', '==', 'sent').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'opened').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'clicked').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'failed').get(),
    (adminDb.collection('contacts') as any).get(),
  ])

  const sent = sentSnap.docs.length
  const opened = openedSnap.docs.length
  const clicked = clickedSnap.docs.length
  const failed = failedSnap.docs.length

  const sourceCounts: Record<string, number> = {}
  for (const doc of contactsSnap.docs.filter((d: any) => d.data().deleted !== true)) {
    const source: string = doc.data().source || 'unknown'
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1
  }
  const sources = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  return apiSuccess({
    funnel: {
      sent,
      opened,
      clicked,
      failed,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
    },
    sources,
  })
})
