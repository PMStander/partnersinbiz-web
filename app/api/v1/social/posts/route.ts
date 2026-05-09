/**
 * GET  /api/v1/social/posts  — list social posts
 * POST /api/v1/social/posts  — create a social post
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { SocialPlatform } from '@/lib/social/types'
import type { SocialPlatformType, PostStatus } from '@/lib/social/providers'
import { ACTIVE_PLATFORMS } from '@/lib/social/providers'
import { validatePostContent } from '@/lib/social/validation'
import { logAudit } from '@/lib/social/audit'
import { notifyApprovalNeeded } from '@/lib/notifications/notify'

export const dynamic = 'force-dynamic'

const VALID_LEGACY_PLATFORMS: SocialPlatform[] = ['x', 'linkedin']
// Use the canonical PostStatus type — includes pending_approval, approved, publishing, partially_published
const VALID_STATUSES: PostStatus[] = [
  'draft', 'qa_review', 'regenerating', 'client_review', 'pending_approval',
  'approved', 'vaulted', 'scheduled', 'publishing', 'published',
  'partially_published', 'failed', 'cancelled',
]

function toLegacyPlatform(platform: string): SocialPlatform | null {
  if (platform === 'x' || platform === 'twitter') return 'x'
  if (platform === 'linkedin') return 'linkedin'
  return null
}

function toProviderPlatform(platform: string): SocialPlatformType | null {
  if (platform === 'x' || platform === 'twitter') return 'twitter'
  const p = platform.toLowerCase() as SocialPlatformType
  return ACTIVE_PLATFORMS.includes(p) ? p : null
}

export const GET = withAuth('client', withTenant(async (req, _user, orgId) => {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') as SocialPlatform | null
  const status = searchParams.get('status') as PostStatus | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('social_posts').where('orgId', '==', orgId)

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

  // In-memory date range filtering
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posts.sort((a: any, b: any) => {
    const aTs: Timestamp | undefined = a.scheduledFor ?? a.scheduledAt
    const bTs: Timestamp | undefined = b.scheduledFor ?? b.scheduledAt
    return (aTs?.seconds ?? 0) - (bTs?.seconds ?? 0)
  })

  return apiSuccess(posts, 200, { total: posts.length, page: 1, limit: posts.length })
}))

export const POST = withAuth('client', withTenant(async (req, user, orgId) => {
  const body = await req.json()

  // --- Resolve content ---
  let contentText: string
  let platformOverrides: Record<string, unknown> = {}

  if (typeof body.content === 'string') {
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
    for (const p of body.platforms) {
      const pt = toProviderPlatform(p)
      if (!pt || !ACTIVE_PLATFORMS.includes(pt)) {
        return apiError(`Unsupported platform: ${p}. Supported: ${ACTIVE_PLATFORMS.join(', ')}`)
      }
      platforms.push(pt)
    }
  } else if (body.platform) {
    legacyPlatform = toLegacyPlatform(body.platform)
    if (!legacyPlatform) {
      return apiError('platform must be one of: x, linkedin')
    }
    platforms = [toProviderPlatform(body.platform)!]
  } else {
    return apiError('platforms[] or platform is required')
  }

  // --- Validate content against platform constraints ---
  const validation = validatePostContent(contentText, platforms, {
    threadParts: body.threadParts,
    mediaCount: body.media?.length,
  })

  if (!validation.valid) {
    return apiError(`Validation failed: ${validation.errors.map(e => e.message).join('; ')}`)
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
    platform: legacyPlatform ?? (platforms[0] === 'twitter' ? 'x' : platforms[0]),
    orgId,
    content: {
      text: contentText,
      platformOverrides,
    },
    media: body.media ?? [],
    platforms,
    accountIds: body.accountIds ?? [],
    status,
    scheduledAt,
    scheduledFor: scheduledAt,
    publishedAt: null,
    platformResults: {},
    hashtags: body.hashtags ?? [],
    labels: body.labels ?? [],
    campaign: body.campaign ?? null,
    campaignId: typeof body.campaignId === 'string' ? body.campaignId : null,
    pillarId: typeof body.pillarId === 'string' ? body.pillarId : null,
    audience: typeof body.audience === 'string' ? body.audience : null,
    createdBy: user.uid,
    assignedTo: null,
    approvedBy: null,
    approvedAt: null,
    comments: [],
    source: (user.uid === 'ai-agent' ? 'ai_agent' : 'api') as string,
    threadParts: body.threadParts ?? [],
    category: body.category ?? 'other',
    tags: body.tags ?? [],
    externalId: null,
    error: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const docRef = await adminDb.collection('social_posts').add(doc)

  // Create queue entry if scheduled
  if (status === 'scheduled' && scheduledAt) {
    await adminDb.collection('social_queue').doc(docRef.id).set({
      orgId,
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

  await logAudit({
    orgId,
    action: 'post.created',
    entityType: 'post',
    entityId: docRef.id,
    performedBy: user.uid,
    performedByRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
    details: { platforms, status, contentLength: contentText.length },
    ip: req.headers.get('x-forwarded-for'),
  })

  // Send approval notification if post requires approval
  // Check org settings for default approval requirement
  try {
    const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
    if (orgDoc.exists && orgDoc.data()?.settings?.defaultApprovalRequired && status === 'draft') {
      notifyApprovalNeeded(docRef.id, contentText, orgId).catch(() => {})
    }
  } catch (err) {
    console.error('[Social] Failed to check approval requirement:', err)
  }

  return apiSuccess({ id: docRef.id }, 201)
}))
