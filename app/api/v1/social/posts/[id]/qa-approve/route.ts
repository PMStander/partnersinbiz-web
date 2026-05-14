/**
 * POST /api/v1/social/posts/:id/qa-approve — admin QA-approves a post.
 *
 * Transitions: qa_review -> client_review (if client review required) or approved.
 * If we land on "approved", we immediately apply finalisation (scheduled / vaulted).
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { logAudit } from '@/lib/social/audit'
import { logActivity } from '@/lib/activity/log'
import {
  getOrgApprovalSettings,
  resolveAfterFinalApproval,
  resolveAfterQaApproval,
  validateTransition,
} from '@/lib/social/approval'
import type { DeliveryMode, PostStatus } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', withTenant(async (req, user, orgId, context) => {
  const { id } = await (context as Params).params

  const ref = adminDb.collection('social_posts').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Post not found', 404)

  const post = snap.data()!
  if (post.orgId && post.orgId !== orgId) return apiError('Post not found', 404)

  const currentStatus = post.status as PostStatus
  const transitionError = validateTransition(currentStatus, 'qa_approve')
  if (transitionError) return apiError(transitionError, 400)

  const orgSettings = await getOrgApprovalSettings(orgId)
  let newStatus = resolveAfterQaApproval(orgSettings.requiresClientApproval)

  // If we land directly on "approved", apply finalisation rules.
  if (newStatus === 'approved') {
    const deliveryMode = (post.deliveryMode as DeliveryMode | undefined) ?? orgSettings.defaultDeliveryMode
    newStatus = resolveAfterFinalApproval({
      deliveryMode,
      hasScheduledAt: !!post.scheduledAt,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    status: newStatus,
    'approval.qaApprovedBy': user.uid,
    'approval.qaApprovedAt': FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  await ref.update(updateData)

  // If this was the final approval (no client step), create a queue entry where applicable.
  if (newStatus === 'scheduled' && post.scheduledAt) {
    await adminDb.collection('social_queue').doc(id).set({
      orgId,
      postId: id,
      scheduledAt: post.scheduledAt,
      status: 'pending',
      priority: 0,
      attempts: 0,
      maxAttempts: 5,
      lastAttemptAt: null,
      nextRetryAt: null,
      backoffSeconds: 60,
      lockedBy: null,
      lockedAt: null,
      startedAt: null,
      completedAt: null,
      error: null,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await logAudit({
    orgId,
    action: 'post.qa_approved',
    entityType: 'post',
    entityId: id,
    performedBy: user.uid,
    performedByRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    details: { from: currentStatus, to: newStatus },
    ip: req.headers.get('x-forwarded-for'),
  })

  logActivity({
    orgId,
    type: 'social_post_qa_approved',
    actorId: user.uid,
    actorName: user.uid,
    actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    description: 'QA approved social post',
    entityId: id,
    entityType: 'social_post',
  }).catch(() => {})

  return apiSuccess({ id, status: newStatus })
}))
