/**
 * GET /api/v1/webhooks/queue-stats
 *
 * Observability snapshot of the outbound webhook queue + worker health.
 * Scoped by orgId when passed; otherwise returns platform-wide totals
 * (AI/admin see everything).
 *
 * Response:
 *   {
 *     byStatus: { pending: N, delivering: N, delivered: N, failed: N },
 *     oldestPendingAgeSeconds: N | null,
 *     stuckDeliveringCount: N,  // claimed > 5 min ago — stuck worker signal
 *     deliveredLast24h: N,
 *     failedLast24h: N,
 *     webhooks: { active: N, autoDisabled: N, total: N }
 *   }
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import { Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

const STUCK_MS = 5 * 60 * 1000
const WINDOW_MS = 24 * 60 * 60 * 1000

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')

  const queueBase = adminDb.collection('webhook_queue')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scope = (q: any) => (orgId ? q.where('orgId', '==', orgId) : q)

  const now = Timestamp.now()
  const windowStart = Timestamp.fromMillis(Date.now() - WINDOW_MS)
  const stuckCutoff = Timestamp.fromMillis(Date.now() - STUCK_MS)

  const [
    pendingSnap,
    deliveringSnap,
    deliveredWindowSnap,
    failedWindowSnap,
    oldestPendingSnap,
    webhooksSnap,
  ] = await Promise.all([
    scope(queueBase.where('status', '==', 'pending')).count().get(),
    scope(queueBase.where('status', '==', 'delivering')).count().get(),
    scope(
      queueBase
        .where('status', '==', 'delivered')
        .where('deliveredAt', '>=', windowStart),
    )
      .count()
      .get(),
    scope(queueBase.where('status', '==', 'failed')).count().get(),
    scope(
      queueBase
        .where('status', '==', 'pending')
        .orderBy('nextAttemptAt', 'asc'),
    )
      .limit(1)
      .get(),
    scope(
      adminDb.collection('outbound_webhooks').where('deleted', '==', false),
    ).get(),
  ])

  let oldestPendingAgeSeconds: number | null = null
  if (!oldestPendingSnap.empty) {
    const doc = oldestPendingSnap.docs[0].data() as { nextAttemptAt?: Timestamp }
    const ts = doc.nextAttemptAt
    if (ts) {
      oldestPendingAgeSeconds = Math.max(
        0,
        Math.floor((now.toMillis() - ts.toMillis()) / 1000),
      )
    }
  }

  // Stuck: delivering AND claimedAt older than 5 min (worker probably died mid-flight).
  const stuckSnap = await scope(
    queueBase
      .where('status', '==', 'delivering')
      .where('claimedAt', '<=', stuckCutoff),
  )
    .count()
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webhooks: Record<string, unknown>[] = webhooksSnap.docs.map((d: any) => d.data())
  const totalWebhooks = webhooks.length
  const activeWebhooks = webhooks.filter((w: Record<string, unknown>) => w.active === true).length
  const autoDisabled = webhooks.filter((w: Record<string, unknown>) => Boolean(w.autoDisabledAt)).length

  return apiSuccess({
    byStatus: {
      pending: pendingSnap.data().count,
      delivering: deliveringSnap.data().count,
      failed: failedWindowSnap.data().count,
      deliveredLast24h: deliveredWindowSnap.data().count,
    },
    oldestPendingAgeSeconds,
    stuckDeliveringCount: stuckSnap.data().count,
    webhooks: {
      total: totalWebhooks,
      active: activeWebhooks,
      autoDisabled,
    },
    timestamp: new Date().toISOString(),
  })
})
