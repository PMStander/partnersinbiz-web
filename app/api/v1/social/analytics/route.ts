/**
 * GET /api/v1/social/analytics — List analytics snapshots with filters
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess } from '@/lib/api/response'
import { calculateBestTimes } from '@/lib/social/analytics'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', withTenant(async (req, _user, orgId) => {
  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') // 'best-times' | 'accounts' | default (post analytics)
  const platform = searchParams.get('platform')
  const postId = searchParams.get('postId')

  // Best times endpoint
  if (view === 'best-times') {
    const slots = await calculateBestTimes(orgId, platform ?? undefined)
    return apiSuccess(slots)
  }

  // Account-level analytics
  if (view === 'accounts') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = adminDb.collection('social_account_analytics')
      .where('orgId', '==', orgId)

    if (platform) query = query.where('platform', '==', platform)

    const snapshot = await query.limit(100).get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))

    return apiSuccess(data, 200, { total: data.length })
  }

  // Post analytics snapshots
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('social_analytics')
    .where('orgId', '==', orgId)

  if (postId) query = query.where('postId', '==', postId)
  if (platform) query = query.where('platform', '==', platform)

  const snapshot = await query.limit(200).get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))

  return apiSuccess(data, 200, { total: data.length })
}))
