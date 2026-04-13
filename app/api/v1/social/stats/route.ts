/**
 * GET /api/v1/social/stats?orgId={id}  — get social analytics for an org
 */
import { NextRequest } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published' | 'failed' | 'cancelled'

interface SocialStats {
  total: number
  byStatus: {
    draft: number
    pending_approval: number
    approved: number
    scheduled: number
    published: number
    failed: number
    cancelled: number
  }
  byPlatform: Record<string, number>
  approvalRate: number
  last30Days: number
}

export const GET = withAuth('client', withTenant(async (req, _user, orgId) => {
  const snapshot = await adminDb.collection('social_posts').where('orgId', '==', orgId).get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posts: any[] = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  // Initialize stats
  const stats: SocialStats = {
    total: posts.length,
    byStatus: {
      draft: 0,
      pending_approval: 0,
      approved: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
      cancelled: 0,
    },
    byPlatform: {},
    approvalRate: 0,
    last30Days: 0,
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Count by status and platform, calculate last 30 days
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  posts.forEach((post: any) => {
    const status = (post.status || 'draft') as PostStatus
    if (status in stats.byStatus) {
      stats.byStatus[status]++
    }

    // Count platforms
    const platforms = post.platforms ?? (post.platform ? [post.platform] : [])
    platforms.forEach((platform: string) => {
      stats.byPlatform[platform] = (stats.byPlatform[platform] ?? 0) + 1
    })

    // Check if created in last 30 days
    const createdAtTs = post.createdAt as Timestamp | undefined
    if (createdAtTs) {
      const createdDate = new Date(createdAtTs.seconds * 1000)
      if (createdDate > thirtyDaysAgo) {
        stats.last30Days++
      }
    }
  })

  // Calculate approval rate (approved / (approved + rejected))
  const approved = stats.byStatus.approved
  const rejected = stats.byStatus.draft // When rejected, status is set back to draft
  const totalReviewable = approved + rejected
  stats.approvalRate = totalReviewable > 0 ? Math.round((approved / totalReviewable) * 100) : 0

  return apiSuccess(stats)
}))
