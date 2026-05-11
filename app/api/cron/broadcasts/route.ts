/**
 * GET /api/cron/broadcasts — process scheduled broadcasts due now.
 *
 * Secured by Authorization: Bearer ${CRON_SECRET}
 * Vercel cron schedule: every 15 minutes (see vercel.json).
 *
 * Flow per tick:
 *   1. Find broadcasts where status == 'scheduled' AND scheduledFor <= now,
 *      plus any stuck in 'sending' (resume mid-flight).
 *   2. For each: flip to 'sending', resolve audience, set audienceSize +
 *      sendStartedAt the first time around.
 *   3. Walk the audience in chunks of CONTACT_CHUNK, calling
 *      sendBroadcastToContact() — which is idempotent via
 *      (broadcastId, contactId) uniqueness in the emails collection.
 *   4. When all contacts done, flip to 'sent' and set sendCompletedAt.
 *   5. On a per-broadcast crash, we leave status='sending' so the next tick
 *      picks up where this one stopped. The idempotency check skips already
 *      sent contacts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { resolveBroadcastAudience } from '@/lib/broadcasts/audience'
import {
  buildSendContext,
  loadSentContactIds,
  sendBroadcastToContact,
} from '@/lib/broadcasts/send'
import type { Broadcast } from '@/lib/broadcasts/types'
import {
  maybeFinalizeWinner,
  dispatchWinnerToRemaining,
} from '@/lib/ab-testing/cronHelpers'
import type { AbConfig } from '@/lib/ab-testing/types'

export const dynamic = 'force-dynamic'
// Cron tasks can take longer than the default — give them up to 5 min.
export const maxDuration = 300

const CONTACT_CHUNK = 50

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Timestamp.now()

  // Pick up freshly-due 'scheduled' rows AND anything stuck in 'sending'
  // from a prior tick that didn't finish.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueSnap = await (adminDb.collection('broadcasts') as any)
    .where('status', '==', 'scheduled')
    .where('scheduledFor', '<=', now)
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendingSnap = await (adminDb.collection('broadcasts') as any)
    .where('status', '==', 'sending')
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docs: any[] = [...dueSnap.docs, ...sendingSnap.docs]

  let processedBroadcasts = 0
  let sentTotal = 0
  let failedTotal = 0
  let skippedTotal = 0
  let abFinalized = 0
  let abDispatched = 0

  // A/B housekeeping: finalize winners for broadcasts whose test window has
  // elapsed, and dispatch the winner to the remaining audience for any
  // already in `winner-pending`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abTestingSnap = await (adminDb.collection('broadcasts') as any)
    .where('ab.status', '==', 'testing')
    .get()
  for (const d of abTestingSnap.docs) {
    const ab = d.data()?.ab as AbConfig | undefined
    if (!ab) continue
    const newStatus = await maybeFinalizeWinner({
      targetCollection: 'broadcasts',
      targetId: d.id,
      ab,
    })
    if (newStatus === 'winner-pending') abFinalized++
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const abPendingSnap = await (adminDb.collection('broadcasts') as any)
    .where('ab.status', '==', 'winner-pending')
    .get()
  for (const d of abPendingSnap.docs) {
    const ab = d.data()?.ab as AbConfig | undefined
    if (!ab) continue
    const result = await dispatchWinnerToRemaining({ broadcastId: d.id, ab })
    abDispatched += result.queued
  }

  for (const docSnap of docs) {
    const broadcast = { id: docSnap.id, ...docSnap.data() } as Broadcast
    if (broadcast.deleted) continue

    try {
      // Resolve audience first — needed both for the 'scheduled' → 'sending'
      // transition and for resuming 'sending' broadcasts.
      const contacts = await resolveBroadcastAudience(broadcast.orgId, broadcast.audience)

      // First-time transition.
      const isFirstTick = broadcast.status === 'scheduled'
      if (isFirstTick) {
        await docSnap.ref.update({
          status: 'sending',
          'stats.audienceSize': contacts.length,
          sendStartedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
        broadcast.status = 'sending'
        broadcast.stats = { ...broadcast.stats, audienceSize: contacts.length }
      }

      if (contacts.length === 0) {
        await docSnap.ref.update({
          status: 'sent',
          sendCompletedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
        processedBroadcasts++
        continue
      }

      const sentCache = await loadSentContactIds(broadcast.id)
      const ctx = await buildSendContext(broadcast)

      // Chunked iteration — each chunk runs sequentially within the chunk
      // (so we don't slam Resend's rate limit) but moves on quickly.
      for (let i = 0; i < contacts.length; i += CONTACT_CHUNK) {
        const slice = contacts.slice(i, i + CONTACT_CHUNK)
        for (const contact of slice) {
          try {
            const outcome = await sendBroadcastToContact(ctx, contact, sentCache)
            if (outcome.status === 'sent') sentTotal++
            else if (outcome.status === 'failed') failedTotal++
            else if (outcome.status === 'skipped') skippedTotal++
          } catch (err) {
            failedTotal++
            // eslint-disable-next-line no-console
            console.error('[cron/broadcasts] contact failed', broadcast.id, contact.id, err)
          }
        }
      }

      // All contacts have either been queued or skipped; mark complete.
      await docSnap.ref.update({
        status: 'sent',
        sendCompletedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      processedBroadcasts++
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[cron/broadcasts] broadcast failed', docSnap.id, err)
      // Leave status='sending' so the next tick can resume.
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      processedBroadcasts,
      sent: sentTotal,
      failed: failedTotal,
      skipped: skippedTotal,
      abFinalized,
      abDispatched,
    },
  })
}
