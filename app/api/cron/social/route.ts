// app/api/cron/social/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { postTweet, postThread } from '@/lib/social/twitter'
import { postToLinkedIn } from '@/lib/social/linkedin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  const validCronAuth = auth === `Bearer ${process.env.CRON_SECRET}`
  const validApiAuth = auth === `Bearer ${process.env.AI_API_KEY}`
  if (!validCronAuth && !validApiAuth) return apiError('Unauthorized', 401)

  const now = Timestamp.now()

  // Fetch only scheduled posts — avoid composite index by filtering scheduledFor in-memory
  const snap = await (adminDb.collection('social_posts') as any)
    .where('status', '==', 'scheduled')
    .get()

  let processed = 0
  let failed = 0

  for (const postDoc of snap.docs) {
    const post = postDoc.data()

    // In-memory filter: skip posts not yet due
    if (post.scheduledFor > now) continue

    try {
      let externalId: string

      if (post.platform === 'x') {
        if (Array.isArray(post.threadParts) && post.threadParts.length > 0) {
          const { ids } = await postThread(post.threadParts)
          externalId = ids[0]
        } else {
          const { id } = await postTweet(post.content)
          externalId = id
        }
      } else if (post.platform === 'linkedin') {
        const { id } = await postToLinkedIn(post.content)
        externalId = id
      } else {
        throw new Error(`Unsupported platform: ${post.platform}`)
      }

      await adminDb.collection('social_posts').doc(postDoc.id).update({
        status: 'published',
        publishedAt: FieldValue.serverTimestamp(),
        externalId,
        error: null,
        updatedAt: FieldValue.serverTimestamp(),
      })

      processed++
    } catch (err) {
      await adminDb.collection('social_posts').doc(postDoc.id).update({
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
        updatedAt: FieldValue.serverTimestamp(),
      })

      failed++
    }
  }

  return apiSuccess({ processed, failed })
}
