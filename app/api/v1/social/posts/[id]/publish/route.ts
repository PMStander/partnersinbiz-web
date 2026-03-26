/**
 * POST /api/v1/social/posts/:id/publish  — publish a post immediately
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { postTweet, postThread } from '@/lib/social/twitter'
import { postToLinkedIn } from '@/lib/social/linkedin'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params

  // 1. Fetch the post document
  const doc = await adminDb.collection('social_posts').doc(id).get()
  if (!doc.exists) return apiError('Post not found', 404)

  const post = doc.data()!

  // 2. Guard against already-published or cancelled posts
  if (post.status === 'published') return apiError('Post already published', 409)
  if (post.status === 'cancelled') return apiError('Cannot publish a cancelled post', 400)

  // 3. Attempt to publish to the correct platform
  let externalId: string

  try {
    if (post.platform === 'x') {
      const threadParts: string[] | undefined = post.threadParts
      if (Array.isArray(threadParts) && threadParts.length > 0) {
        const { ids } = await postThread(threadParts)
        externalId = ids[0]
      } else {
        const { id: tweetId } = await postTweet(post.content as string)
        externalId = tweetId
      }
    } else if (post.platform === 'linkedin') {
      const { id: urn } = await postToLinkedIn(post.content as string)
      externalId = urn
    } else {
      return apiError('Unsupported platform', 400)
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

  // 4. Mark post as published
  await adminDb.collection('social_posts').doc(id).update({
    status: 'published',
    publishedAt: FieldValue.serverTimestamp(),
    externalId,
    error: null,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id, externalId, platform: post.platform })
})
