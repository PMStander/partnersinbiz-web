/**
 * Social Analytics Collection — Pulls engagement data from platform providers
 * and stores snapshots in social_analytics / social_account_analytics collections.
 *
 * Scheduled snapshots: 1h, 24h, 7d, 30d after publication.
 * Account-level: daily follower/following/post counts.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { getDefaultProvider } from '@/lib/social/providers'
import type { SocialPlatformType, AnalyticsData } from '@/lib/social/providers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostAnalyticsSnapshot {
  orgId: string
  postId: string
  accountId: string
  platform: string
  platformPostId: string
  metrics: {
    impressions: number
    reach: number
    engagements: number
    likes: number
    comments: number
    shares: number
    saves: number
    clicks: number
    profileVisits: number | null
    videoViews: number | null
    videoWatchTime: number | null
    followsFromPost: number | null
  }
  collectedAt: Timestamp
  snapshotType: '1h' | '24h' | '7d' | '30d' | 'manual'
  createdAt: Timestamp
}

export interface AccountAnalyticsSnapshot {
  orgId: string
  accountId: string
  platform: string
  date: string
  metrics: {
    followers: number
    following: number
    postsCount: number
    impressions: number | null
    profileViews: number | null
    engagementRate: number | null
  }
  createdAt: Timestamp
}

// ---------------------------------------------------------------------------
// Snapshot schedule: hours after publish → snapshot type
// ---------------------------------------------------------------------------

const SNAPSHOT_SCHEDULE: Array<{ hoursAfter: number; type: '1h' | '24h' | '7d' | '30d' }> = [
  { hoursAfter: 1, type: '1h' },
  { hoursAfter: 24, type: '24h' },
  { hoursAfter: 168, type: '7d' },
  { hoursAfter: 720, type: '30d' },
]

// ---------------------------------------------------------------------------
// Collect analytics for a single post
// ---------------------------------------------------------------------------

export async function collectPostAnalytics(
  postId: string,
  snapshotType: '1h' | '24h' | '7d' | '30d' | 'manual' = 'manual',
): Promise<AnalyticsData | null> {
  const postDoc = await adminDb.collection('social_posts').doc(postId).get()
  if (!postDoc.exists) return null

  const post = postDoc.data()!
  if (post.status !== 'published') return null

  const results: Record<string, unknown> = post.platformResults ?? {}
  let totalMetrics: AnalyticsData = {
    impressions: 0, reach: 0, engagements: 0,
    likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0,
  }

  for (const [platformKey, result] of Object.entries(results)) {
    const pr = result as { platformPostId?: string; status?: string }
    if (pr.status !== 'published' || !pr.platformPostId) continue

    const platform = platformKey as SocialPlatformType
    try {
      const provider = getDefaultProvider(platform)
      const analytics = await provider.getAnalytics(pr.platformPostId)
      if (!analytics) continue

      // Store per-platform snapshot
      await adminDb.collection('social_analytics').add({
        orgId: post.orgId,
        postId,
        accountId: '', // filled when account tracking is more granular
        platform: platformKey,
        platformPostId: pr.platformPostId,
        metrics: {
          impressions: analytics.impressions,
          reach: analytics.reach,
          engagements: analytics.engagements,
          likes: analytics.likes,
          comments: analytics.comments,
          shares: analytics.shares,
          saves: analytics.saves,
          clicks: analytics.clicks,
          profileVisits: null,
          videoViews: null,
          videoWatchTime: null,
          followsFromPost: null,
        },
        collectedAt: FieldValue.serverTimestamp(),
        snapshotType,
        createdAt: FieldValue.serverTimestamp(),
      })

      // Accumulate totals
      totalMetrics = {
        impressions: totalMetrics.impressions + analytics.impressions,
        reach: totalMetrics.reach + analytics.reach,
        engagements: totalMetrics.engagements + analytics.engagements,
        likes: totalMetrics.likes + analytics.likes,
        comments: totalMetrics.comments + analytics.comments,
        shares: totalMetrics.shares + analytics.shares,
        saves: totalMetrics.saves + analytics.saves,
        clicks: totalMetrics.clicks + analytics.clicks,
      }
    } catch {
      // Skip platform if analytics fetch fails
    }
  }

  return totalMetrics
}

// ---------------------------------------------------------------------------
// Collect account-level analytics
// ---------------------------------------------------------------------------

export async function collectAccountAnalytics(orgId: string): Promise<number> {
  const snapshot = await adminDb.collection('social_accounts')
    .where('orgId', '==', orgId)
    .where('status', '==', 'active')
    .get()

  const today = new Date().toISOString().slice(0, 10)
  let collected = 0

  for (const doc of snapshot.docs) {
    const account = doc.data()
    const platform = account.platform as SocialPlatformType

    try {
      const provider = getDefaultProvider(platform)
      const profile = await provider.getProfile()

      await adminDb.collection('social_account_analytics').add({
        orgId,
        accountId: doc.id,
        platform,
        date: today,
        metrics: {
          followers: profile.followerCount ?? 0,
          following: profile.followingCount ?? 0,
          postsCount: 0,
          impressions: null,
          profileViews: null,
          engagementRate: null,
        },
        createdAt: FieldValue.serverTimestamp(),
      })

      collected++
    } catch {
      // Skip accounts that fail
    }
  }

  return collected
}

// ---------------------------------------------------------------------------
// Best time to post calculator
// ---------------------------------------------------------------------------

export interface BestTimeSlot {
  dayOfWeek: number // 0=Sunday
  hour: number      // 0-23
  avgScore: number
  postCount: number
}

export async function calculateBestTimes(orgId: string, platform?: string): Promise<BestTimeSlot[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('social_analytics')
    .where('orgId', '==', orgId)

  if (platform) {
    query = query.where('platform', '==', platform)
  }

  const snapshot = await query.limit(500).get()

  // Group analytics by postId to get the best snapshot per post
  const postBest = new Map<string, { metrics: PostAnalyticsSnapshot['metrics']; publishedAt: number }>()

  for (const doc of snapshot.docs) {
    const data = doc.data() as PostAnalyticsSnapshot
    const existing = postBest.get(data.postId)
    const score = data.metrics.impressions + data.metrics.likes * 2 + data.metrics.shares * 5 + data.metrics.comments * 3

    if (!existing) {
      // Look up publish time
      const postDoc = await adminDb.collection('social_posts').doc(data.postId).get()
      const postData = postDoc.data()
      const publishedAt = postData?.publishedAt?.toMillis?.() ?? postData?.scheduledAt?.toMillis?.() ?? 0
      if (publishedAt) {
        postBest.set(data.postId, { metrics: data.metrics, publishedAt })
      }
    }
  }

  // Aggregate by day/hour buckets
  const buckets = new Map<string, { total: number; count: number; dayOfWeek: number; hour: number }>()

  for (const { metrics, publishedAt } of postBest.values()) {
    const d = new Date(publishedAt)
    const dayOfWeek = d.getDay()
    const hour = d.getHours()
    const key = `${dayOfWeek}-${hour}`
    const score = metrics.impressions + metrics.likes * 2 + metrics.shares * 5 + metrics.comments * 3

    const bucket = buckets.get(key) ?? { total: 0, count: 0, dayOfWeek, hour }
    bucket.total += score
    bucket.count++
    buckets.set(key, bucket)
  }

  // Rank buckets with minimum 5 posts for significance
  const slots: BestTimeSlot[] = []
  for (const bucket of buckets.values()) {
    if (bucket.count < 3) continue // Lower threshold for early use
    slots.push({
      dayOfWeek: bucket.dayOfWeek,
      hour: bucket.hour,
      avgScore: Math.round(bucket.total / bucket.count),
      postCount: bucket.count,
    })
  }

  return slots.sort((a, b) => b.avgScore - a.avgScore).slice(0, 10)
}

// ---------------------------------------------------------------------------
// Cron: process scheduled analytics snapshots
// ---------------------------------------------------------------------------

export interface AnalyticsCronResult {
  postsChecked: number
  snapshotsCreated: number
  accountsChecked: number
  errors: string[]
}

export async function processAnalyticsCron(): Promise<AnalyticsCronResult> {
  const result: AnalyticsCronResult = { postsChecked: 0, snapshotsCreated: 0, accountsChecked: 0, errors: [] }

  const now = Date.now()

  // Find published posts that need analytics snapshots
  const publishedSnapshot = await adminDb.collection('social_posts')
    .where('status', '==', 'published')
    .limit(100)
    .get()

  for (const doc of publishedSnapshot.docs) {
    const post = doc.data()
    const publishedAt = post.publishedAt?.toMillis?.() ?? post.scheduledAt?.toMillis?.() ?? 0
    if (!publishedAt) continue

    const hoursSincePublish = (now - publishedAt) / (1000 * 60 * 60)

    // Determine which snapshot type is due
    for (const schedule of SNAPSHOT_SCHEDULE) {
      if (hoursSincePublish < schedule.hoursAfter - 0.5) continue
      if (hoursSincePublish > schedule.hoursAfter + 6) continue // Window: up to 6 hours late

      // Check if this snapshot type already exists for this post
      const existing = await adminDb.collection('social_analytics')
        .where('postId', '==', doc.id)
        .where('snapshotType', '==', schedule.type)
        .limit(1)
        .get()

      if (!existing.empty) continue

      result.postsChecked++
      try {
        const metrics = await collectPostAnalytics(doc.id, schedule.type)
        if (metrics) result.snapshotsCreated++
      } catch (err: unknown) {
        result.errors.push(`Post ${doc.id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
  }

  // Collect account-level analytics (daily)
  const orgs = new Set<string>()
  const accountsSnapshot = await adminDb.collection('social_accounts')
    .where('status', '==', 'active')
    .get()

  for (const doc of accountsSnapshot.docs) {
    orgs.add(doc.data().orgId)
  }

  for (const orgId of orgs) {
    try {
      const count = await collectAccountAnalytics(orgId)
      result.accountsChecked += count
    } catch (err: unknown) {
      result.errors.push(`Org ${orgId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return result
}
