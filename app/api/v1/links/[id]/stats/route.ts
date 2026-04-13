/**
 * GET /api/v1/links/[id]/stats
 * Returns detailed click analytics — clicks over time, top referrers, top countries
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getLinkStats } from '@/lib/links/shorten'
import type { ShortenedLink } from '@/lib/links/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/links/[id]/stats
 * Gets detailed analytics for a shortened link
 */
export const GET = withAuth('client', withTenant(async (req, _user, orgId, context) => {
  const params = context?.params as { id: string } | undefined
  const linkId = params?.id

  if (!linkId) {
    return apiError('Link ID is required')
  }

  try {
    const doc = await adminDb.collection('shortened_links').doc(linkId).get()

    if (!doc.exists) {
      return apiError('Link not found', 404)
    }

    const linkData = doc.data() as ShortenedLink
    if (linkData.orgId !== orgId) {
      return apiError('Forbidden', 403)
    }

    // Get detailed stats
    const stats = await getLinkStats(linkId, orgId)

    return apiSuccess({
      id: linkId,
      shortUrl: linkData.shortUrl,
      originalUrl: linkData.originalUrl,
      stats,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve stats'
    return apiError(message, 400)
  }
}))
