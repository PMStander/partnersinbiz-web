/**
 * POST /api/v1/social/posts/:id/publish  — publish a post immediately
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getDefaultProvider } from '@/lib/social/providers'
import type { SocialPlatformType } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Map legacy platform names to provider platform types */
function toPlatformType(platform: string): SocialPlatformType | null {
  if (platform === 'x' || platform === 'twitter') return 'twitter'
  if (platform === 'linkedin') return 'linkedin'
  return null
}

export const POST = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params

  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)

  const post = doc.data()!

  if (post.status === 'published') return apiError('Post already published', 409)
  if (post.status === 'cancelled') return apiError('Cannot publish a cancelled post', 400)

  // Resolve platform — supports both legacy 'x' and new 'twitter' naming
  const platformType = toPlatformType(post.platform)
  if (!platformType) return apiError(`Unsupported platform: ${post.platform}`, 400)

  // Resolve content — supports both legacy flat string and new { text } structure
  const text = typeof post.content === 'string' ? post.content : post.content?.text
  if (!text) return apiError('Post has no content', 400)

  let externalId: string

  try {
    const provider = getDefaultProvider(platformType)
    const threadParts: string[] | undefined = post.threadParts

    if (Array.isArray(threadParts) && threadParts.length > 0) {
      const results = await provider.publishThread(threadParts)
      externalId = results[0].platformPostId
    } else {
      const result = await provider.publishPost({ text })
      externalId = result.platformPostId
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await adminDb.collection('social_posts').doc(id).update({
      status: 'failed',
      error: message,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return apiError('Publish failed: ' + message, 500)
  }

  await adminDb.collection('social_posts').doc(id).update({
    status: 'published',
    publishedAt: FieldValue.serverTimestamp(),
    externalId,
    error: null,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id, externalId, platform: post.platform })
})
