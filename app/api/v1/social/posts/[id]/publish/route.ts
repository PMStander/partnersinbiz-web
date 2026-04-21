/**
 * POST /api/v1/social/posts/:id/publish  — publish a post immediately
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { toPlatformType, resolveProvider, refreshAccountToken } from '@/lib/social/account-resolver'
import { logAudit } from '@/lib/social/audit'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', withTenant(async (_req, user, orgId, context) => {
  const { id } = await (context as Params).params

  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)

  const post = doc.data()!
  if (post.orgId && post.orgId !== orgId) return apiError('Post not found', 404)
  if (post.status === 'published') return apiError('Post already published', 409)
  if (post.status === 'cancelled') return apiError('Cannot publish a cancelled post', 400)

  const platformType = toPlatformType(post.platform)
  if (!platformType) return apiError(`Unsupported platform: ${post.platform}`, 400)

  const text = typeof post.content === 'string' ? post.content : post.content?.text
  if (!text) return apiError('Post has no content', 400)

  const mediaUrls: string[] | undefined = Array.isArray(post.media) && post.media.length > 0
    ? (post.media as Array<{ url?: string }>).map((m) => m.url).filter((u): u is string => Boolean(u))
    : undefined

  let externalId: string

  try {
    // Resolve provider: explicit accountIds > default account for org+platform > env vars
    const { provider, accountId } = await resolveProvider(post, orgId, platformType)
    const threadParts: string[] | undefined = post.threadParts

    // Attempt publish with auto-refresh on 401
    try {
      if (Array.isArray(threadParts) && threadParts.length > 0) {
        const results = await provider.publishThread(threadParts, mediaUrls)
        externalId = results[0].platformPostId
      } else {
        const result = await provider.publishPost({ text, mediaUrls })
        externalId = result.platformPostId
      }
    } catch (publishErr) {
      const msg = publishErr instanceof Error ? publishErr.message : 'Unknown error'
      if (msg.includes('401') && accountId) {
        console.log(`[publish] 401, refreshing token for ${accountId}`)
        const refreshed = await refreshAccountToken(accountId, orgId, platformType)
        if (refreshed) {
          if (Array.isArray(threadParts) && threadParts.length > 0) {
            const results = await refreshed.publishThread(threadParts, mediaUrls)
            externalId = results[0].platformPostId
          } else {
            const result = await refreshed.publishPost({ text, mediaUrls })
            externalId = result.platformPostId
          }
          console.log(`[publish] Retry succeeded after refresh for ${accountId}`)
        } else {
          throw publishErr
        }
      } else {
        throw publishErr
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await adminDb.collection('social_posts').doc(id).update({
      status: 'failed', error: message, updatedAt: FieldValue.serverTimestamp(),
    })
    await logAudit({
      orgId, action: 'post.failed', entityType: 'post', entityId: id,
      performedBy: 'system', performedByRole: 'system',
      details: { error: message, platform: post.platform },
    })
    return apiError('Publish failed: ' + message, 500)
  }

  await adminDb.collection('social_posts').doc(id).update({
    status: 'published', publishedAt: FieldValue.serverTimestamp(), externalId, error: null, updatedAt: FieldValue.serverTimestamp(),
  })

  // Complete queue entry if exists
  const queueDoc = await adminDb.collection('social_queue').doc(id).get()
  if (queueDoc.exists) {
    await adminDb.collection('social_queue').doc(id).update({
      status: 'completed', completedAt: FieldValue.serverTimestamp(),
    })
  }

  await logAudit({
    orgId, action: 'post.published', entityType: 'post', entityId: id,
    performedBy: user.uid,
    performedByRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    details: { externalId, platform: post.platform },
  })

  return apiSuccess({ id, externalId, platform: post.platform })
}))
