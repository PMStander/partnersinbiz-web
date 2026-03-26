/**
 * GET  /api/v1/social/posts  — list social posts (admin only)
 * POST /api/v1/social/posts  — create a social post (admin only)
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { SocialPlatform, SocialPostStatus, SocialPostInput } from '@/lib/social/types'

export const dynamic = 'force-dynamic'

const VALID_PLATFORMS: SocialPlatform[] = ['x', 'linkedin']
const VALID_STATUSES: SocialPostStatus[] = ['draft', 'scheduled', 'published', 'failed', 'cancelled']

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') as SocialPlatform | null
  const status = searchParams.get('status') as SocialPostStatus | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Build Firestore query with equality filters only (avoid composite index requirements)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('social_posts')

  if (platform && VALID_PLATFORMS.includes(platform)) {
    query = query.where('platform', '==', platform)
  }

  if (status && VALID_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }

  const snapshot = await query.get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let posts = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  // In-memory date range filtering to avoid composite index requirements
  if (from) {
    const fromDate = new Date(from)
    if (!isNaN(fromDate.getTime())) {
      const fromTs = Timestamp.fromDate(fromDate)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      posts = posts.filter((p: any) => {
        const sf: Timestamp | undefined = p.scheduledFor
        return sf && sf.seconds >= fromTs.seconds
      })
    }
  }

  if (to) {
    const toDate = new Date(to)
    if (!isNaN(toDate.getTime())) {
      const toTs = Timestamp.fromDate(toDate)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      posts = posts.filter((p: any) => {
        const sf: Timestamp | undefined = p.scheduledFor
        return sf && sf.seconds <= toTs.seconds
      })
    }
  }

  // Sort ascending by scheduledFor in-memory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posts.sort((a: any, b: any) => {
    const aTs: Timestamp | undefined = a.scheduledFor
    const bTs: Timestamp | undefined = b.scheduledFor
    const aSeconds = aTs?.seconds ?? 0
    const bSeconds = bTs?.seconds ?? 0
    return aSeconds - bSeconds
  })

  return apiSuccess(posts, 200, { total: posts.length })
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const body: SocialPostInput = await req.json()

  const { platform, content, scheduledFor, threadParts, category, tags } = body

  // Validate platform
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return apiError('platform must be one of: x, linkedin')
  }

  // Validate content
  if (!content || typeof content !== 'string' || !content.trim()) {
    return apiError('content is required and must be a non-empty string')
  }

  // Validate scheduledFor
  if (!scheduledFor || typeof scheduledFor !== 'string') {
    return apiError('scheduledFor is required and must be an ISO date string')
  }
  const scheduledDate = new Date(scheduledFor)
  if (isNaN(scheduledDate.getTime())) {
    return apiError('scheduledFor must be a valid ISO date string')
  }

  // Determine status based on whether scheduledFor is in the future
  const now = new Date()
  const status: SocialPostStatus = scheduledDate > now ? 'scheduled' : 'draft'

  const docRef = await adminDb.collection('social_posts').add({
    platform,
    content: content.trim(),
    threadParts: threadParts ?? [],
    scheduledFor: Timestamp.fromDate(scheduledDate),
    status,
    publishedAt: null,
    externalId: null,
    error: null,
    category: category ?? 'other',
    tags: tags ?? [],
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id: docRef.id }, 201)
})
