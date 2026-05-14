/**
 * POST /api/v1/social/posts/:id/qa-reject — admin rejects a post at the QA stage.
 *
 * Body: { reason: string }
 *
 * Writes a qa_rejection comment, increments rejection counters, transitions the
 * post to "regenerating", and triggers AI regeneration in the background.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { logAudit } from '@/lib/social/audit'
import { logActivity } from '@/lib/activity/log'
import { buildRejectionRecord, validateTransition } from '@/lib/social/approval'
import { regeneratePost } from '@/lib/social/regenerate'
import type { PostStatus } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', withTenant(async (req, user, orgId, context) => {
  const { id } = await (context as Params).params

  const body = await req.json().catch(() => ({}))
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!reason) {
    return apiError('reason is required and cannot be empty', 400)
  }

  const ref = adminDb.collection('social_posts').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Post not found', 404)

  const post = snap.data()!
  if (post.orgId && post.orgId !== orgId) return apiError('Post not found', 404)

  const currentStatus = post.status as PostStatus
  const transitionError = validateTransition(currentStatus, 'qa_reject')
  if (transitionError) return apiError(transitionError, 400)

  // Look up the rejecter's display name from users/{uid}.displayName.
  const userDoc = await adminDb.collection('users').doc(user.uid).get()
  const displayName = userDoc.exists ? (userDoc.data()?.displayName || user.uid) : user.uid

  const batch = adminDb.batch()

  // 1. Write the rejection comment.
  const commentRef = ref.collection('comments').doc()
  batch.set(commentRef, {
    userId: user.uid,
    userName: displayName,
    userRole: 'admin',
    kind: 'qa_rejection',
    text: reason,
    agentPickedUp: false,
    createdAt: FieldValue.serverTimestamp(),
  })

  // 2. Update the post.
  batch.update(ref, {
    status: 'regenerating' as PostStatus,
    'approval.rejectionCount': FieldValue.increment(1),
    'approval.lastRejectionStage': 'qa',
    'approval.lastRejectedAt': FieldValue.serverTimestamp(),
    'approval.history': FieldValue.arrayUnion(
      buildRejectionRecord({
        stage: 'qa',
        reason,
        rejectedBy: user.uid,
        rejectedByName: displayName,
      }),
    ),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await batch.commit()

  const previousRejectionCount = (post.approval?.rejectionCount as number) ?? 0
  const newRejectionCount = previousRejectionCount + 1

  await logAudit({
    orgId,
    action: 'post.qa_rejected',
    entityType: 'post',
    entityId: id,
    performedBy: user.uid,
    performedByRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    details: { reason, rejectionCount: newRejectionCount },
    ip: req.headers.get('x-forwarded-for'),
  })

  logActivity({
    orgId,
    type: 'social_post_qa_rejected',
    actorId: user.uid,
    actorName: displayName,
    actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    description: 'QA rejected social post',
    entityId: id,
    entityType: 'social_post',
  }).catch(() => {})

  // Fire-and-forget regeneration — don't block the response.
  regeneratePost({
    postId: id,
    orgId,
    actorUid: 'ai-agent',
    actorRole: 'ai',
  }).catch((err) => console.error('[qa-reject] regen failed:', err))

  return apiSuccess({ id, status: 'regenerating' })
}))
