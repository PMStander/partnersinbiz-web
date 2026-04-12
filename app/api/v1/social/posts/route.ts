/**
 * GET  /api/v1/social/posts  — list social posts (admin only)
 * POST /api/v1/social/posts  — create a social post (admin only)
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { SocialPlatform, SocialPostStatus } from '@/lib/social/types'
import type { SocialPlatformType, PostStatus } from '@/lib/social/providers'
import { ACTIVE_PLATFORMS } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

const VALID_LEGACY_PLATFORMS: SocialPlatform[] = ['x', 'linkedin']
const VALID_STATUSES: SocialPostStatus[] = ['draft', 'scheduled', 'published', 'failed', 'cancelled']

/** Map legacy platform name to provider platform type */
function toLegacyPlatform(platform: string): SocialPlatform | null {
  if (platform === 'x' || platform === 'twitter') return 'x'
  if (platform === 'linkedin') return 'linkedin'
  return null
}

function toProviderPlatform(platform: string): SocialPlatformType | null {
  if (platform === 'x' || platform === 'twitter') return 'twitter'
  if (platform === 'linkedin') return 'linkedin'
  return null
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') as SocialPlatform | null
  const status = searchParams.get('status') as SocialPostStatus | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Build Firestore query with equality filters only (avoid composite index requirements)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('social_posts')

  if (platform && VALID_LEGACY_PLATFORMS.includes(platform)) {
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
        const sf: Timestamp | undefined = p.scheduledFor ?? p.scheduledAt
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
        const sf: Timestamp | undefined = p.scheduledFor ?? p.scheduledAt
        return sf && sf.seconds <= toTs.seconds
      })
    }
  }

  // Sort ascending by scheduledFor/scheduledAt in-memory
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posts.sort((a: any, b: any) => {
    const aTs: Timestamp | undefined = a.scheduledFor ?? a.scheduledAt
    const bTs: Timestamp | undefined = b.scheduledFor ?? b.scheduledAt
    const aSeconds = aTs?.seconds ?? 0
    const bSeconds = bTs?.seconds ?? 0
    return aSeconds - bSeconds
  })

  return apiSuccess(posts, 200, { total: posts.length, page: 1, limit: posts.length })
})

/**
 * Create a new social post using the EnhancedSocialPost schema.
 *
 * Accepts both legacy input (flat content string, single platform) and
 * enhanced input (content.text, platforms[], accountIds[], media[]).
 */
export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const body = await req.json()

  // --- Resolve content ---
  let contentText: string
  let platformOverrides: Record<string, unknown> = {}

  if (typeof body.content === 'string') {
    // Legacy: flat string
    contentText = body.content.trim()
  } else if (body.content?.text) {
    contentText = (body.content.text as string).trim()
    platformOverrides = body.content.platformOverrides ?? {}
  } else {
    return apiError('content is required (string or { text })')
  }

  if (!contentText) return apiError('content text must be non-empty')

  // --- Resolve platforms ---
  let platforms: SocialPlatformType[] = []
  let legacyPlatform: SocialPlatform | null = null

  if (body.platforms && Array.isArray(body.platforms)) {
    // Enhanced: platforms array
    for (const p of body.platforms) {
      const pt = toProviderPlatform(p)
      if (!pt || !ACTIVE_PLATFORMS.includes(pt)) {
        return apiError(`Unsupported platform: ${p}. Supported: ${ACTIVE_PLATFORMS.join(', ')}`)
      }
      platforms.push(pt)
    }
  } else if (body.platform) {
    // Legacy: single platform field
    legacyPlatform = toLegacyPlatform(body.platform)
    if (!legacyPlatform) {
      return apiError('platform must be one of: x, linkedin')
    }
    platforms = [toProviderPlatform(body.platform)!]
  } else {
    return apiError('platforms[] or platform is required')
  }

  // --- Resolve scheduling ---
  const scheduledForRaw = body.scheduledFor ?? body.scheduledAt
  let scheduledAt: Timestamp | null = null
  let status: PostStatus = 'draft'

  if (scheduledForRaw) {
    const scheduledDate = new Date(scheduledForRaw)
    if (isNaN(scheduledDate.getTime())) {
      return apiError('scheduledFor/scheduledAt must be a valid ISO date string')
    }
    scheduledAt = Timestamp.fromDate(scheduledDate)
    status = (body.status === 'draft') ? 'draft' : 'scheduled'
  }

  if (body.status === 'draft') status = 'draft'

  // --- Build EnhancedSocialPost document ---
  const doc = {
    // Legacy fields (kept for backward compat with existing UI/cron)
    platform: legacyPlatform ?? (platforms[0] === 'twitter' ? 'x' : platforms[0]),
    // Enhanced fields
    orgId: body.orgId ?? 'default',
    content: {
      text: contentText,
      platformOverrides,
    },
    media: body.media ?? [],
    platforms,
    accountIds: body.accountIds ?? [],
    status,
    scheduledAt,
    // Legacy field name alias
    scheduledFor: scheduledAt,
    publishedAt: null,
    platformResults: {},
    hashtags: body.hashtags ?? [],
    labels: body.labels ?? [],
    campaign: body.campaign ?? null,
    createdBy: user.uid,
    assignedTo: null,
    approvedBy: null,
    approvedAt: null,
    comments: [],
    source: (user.uid === 'ai-agent' ? 'ai_agent' : 'api') as string,
    // Legacy compat
    threadParts: body.threadParts ?? [],
    category: body.category ?? 'other',
    tags: body.tags ?? [],
    externalId: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const docRef = await adminDb.collection('social_posts').add(doc)

  // If scheduled, create a queue entry
  if (status === 'scheduled' && scheduledAt) {
    await adminDb.collection('social_queue').doc(docRef.id).set({
      orgId: doc.orgId,
      postId: docRef.id,
      scheduledAt,
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

  return apiSuccess({ id: docRef.id }, 201)
})
