/**
 * GET /api/v1/social/health  — system health check for social subsystem
 */
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId') ?? 'default'
  const now = Timestamp.now()

  // Queue health — count by status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queueSnap = await (adminDb.collection('social_queue') as any)
    .where('orgId', '==', orgId)
    .get()

  const queueHealth = { pending: 0, processing: 0, completed: 0, failed: 0, stale: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of queueSnap.docs) {
    const data = doc.data()
    const status = data.status as keyof typeof queueHealth
    if (status in queueHealth) queueHealth[status]++

    // Check for stale locks (processing for >5min)
    if (data.status === 'processing' && data.lockedAt) {
      const lockAge = now.seconds - data.lockedAt.seconds
      if (lockAge > 300) queueHealth.stale++
    }
  }

  // Account connectivity — count by status
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountSnap = await (adminDb.collection('social_accounts') as any)
    .where('orgId', '==', orgId)
    .get()

  const accountHealth = { active: 0, token_expired: 0, disconnected: 0, rate_limited: 0, total: 0 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const doc of accountSnap.docs) {
    const data = doc.data()
    accountHealth.total++
    const status = data.status as keyof typeof accountHealth
    if (status in accountHealth && status !== 'total') {
      (accountHealth as Record<string, number>)[status]++
    }
  }

  return apiSuccess({
    queue: queueHealth,
    accounts: accountHealth,
    timestamp: now.toDate().toISOString(),
  })
})
