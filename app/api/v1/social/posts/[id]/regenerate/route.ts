/**
 * POST /api/v1/social/posts/:id/regenerate
 *
 * Manually re-runs the AI regeneration on a post that has unresolved rejection
 * feedback. Sets the post to "regenerating" immediately so the client can show
 * progress, then delegates to lib/social/regenerate.ts which writes the new
 * content + transitions back to qa_review.
 *
 * Accepts post in qa_review, client_review, or pending_approval (legacy).
 * Empty (or {}) body — no required fields.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { validateTransition } from '@/lib/social/approval'
import { regeneratePost } from '@/lib/social/regenerate'
import type { PostStatus } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', withTenant(async (_req, user, orgId, context) => {
  const { id } = await (context as Params).params

  const ref = adminDb.collection('social_posts').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Post not found', 404)

  const post = snap.data()!
  if (post.orgId && post.orgId !== orgId) return apiError('Post not found', 404)

  const fromStatus = post.status as PostStatus
  const transitionError = validateTransition(fromStatus, 'regenerate_start')
  if (transitionError) return apiError(transitionError, 400)

  // Flip to regenerating up-front so the UI can show progress while Claude runs.
  await ref.update({
    status: 'regenerating' as PostStatus,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const actorRole: 'admin' | 'client' | 'ai' =
    user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client'

  try {
    const result = await regeneratePost({
      postId: id,
      orgId,
      actorUid: user.uid,
      actorRole,
    })

    return apiSuccess({
      id,
      status: result.newStatus,
      regenerationCount: result.regenerationCount,
      oldText: result.oldText,
      newText: result.newText,
      feedbackUsed: result.feedbackUsed.length,
    })
  } catch (err) {
    // Revert status so the post isn't stuck in regenerating on failure.
    try {
      await ref.update({
        status: fromStatus,
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch {
      // best effort
    }
    const message = err instanceof Error ? err.message : 'Regeneration failed'
    return apiError(message, 400)
  }
}))
