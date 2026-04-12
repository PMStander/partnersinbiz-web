/**
 * GET  /api/v1/social/analytics/:postId — Get analytics for a specific post
 * POST /api/v1/social/analytics/:postId — Force-refresh analytics for a post
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { collectPostAnalytics } from '@/lib/social/analytics'

export const dynamic = 'force-dynamic'

function getPostId(req: NextRequest): string {
  const parts = req.nextUrl.pathname.split('/')
  return parts[parts.length - 1]
}

export const GET = withAuth('admin', withTenant(async (req, _user, orgId) => {
  const postId = getPostId(req)

  const snapshot = await adminDb.collection('social_analytics')
    .where('orgId', '==', orgId)
    .where('postId', '==', postId)
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))

  // Get the latest metrics per platform
  const latest: Record<string, unknown> = {}
  for (const snap of data) {
    const key = snap.platform as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = latest[key] as any
    if (!existing || (snap.collectedAt?.seconds ?? 0) > (existing.collectedAt?.seconds ?? 0)) {
      latest[key] = snap
    }
  }

  return apiSuccess({ snapshots: data, latest: Object.values(latest) })
}))

export const POST = withAuth('admin', withTenant(async (req, _user, orgId) => {
  const postId = getPostId(req)

  // Verify the post belongs to this org
  const postDoc = await adminDb.collection('social_posts').doc(postId).get()
  if (!postDoc.exists) return apiError('Post not found', 404)
  if (postDoc.data()?.orgId !== orgId) return apiError('Post not found', 404)

  const metrics = await collectPostAnalytics(postId, 'manual')
  if (!metrics) return apiError('No metrics available (post may not be published)', 404)

  return apiSuccess({ metrics })
}))
