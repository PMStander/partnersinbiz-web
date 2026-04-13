/**
 * GET /api/v1/social/posts/pending — fetch pending approval posts
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '5'), 100)

  try {
    // Query posts with status = 'pending_approval'
    const query = adminDb
      .collection('social_posts')
      .where('status', '==', 'pending_approval')
      .orderBy('scheduledAt', 'asc')
      .limit(limit)

    const snapshot = await query.get()

    // Build result with org names
    const posts = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data()
        let orgName = 'Unknown'

        // Look up organization name
        if (data.orgId) {
          const orgDoc = await adminDb.collection('organizations').doc(data.orgId).get()
          if (orgDoc.exists) {
            orgName = orgDoc.data()?.name || 'Unknown'
          }
        }

        return {
          id: doc.id,
          content: (data.content?.text || data.content || '').substring(0, 120),
          platform: data.platform || 'unknown',
          orgId: data.orgId,
          orgName,
          scheduledAt: data.scheduledAt || data.scheduledFor,
        }
      })
    )

    return apiSuccess(posts)
  } catch (err) {
    console.error('[pending-posts-error]', err)
    return apiError('Failed to fetch pending approvals', 500)
  }
})
