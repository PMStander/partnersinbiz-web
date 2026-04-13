/**
 * GET    /api/v1/links/[id]  — get link details + click analytics
 * DELETE /api/v1/links/[id]  — remove a shortened link
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getLinkStats } from '@/lib/links/shorten'
import type { ShortenedLink, LinkStats } from '@/lib/links/types'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/links/[id]
 * Gets link details and click analytics
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

    // Get click stats
    const stats = await getLinkStats(linkId, orgId)

    return apiSuccess({
      ...linkData,
      id: linkId,
      stats,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve link'
    return apiError(message, 400)
  }
}))

/**
 * DELETE /api/v1/links/[id]
 * Removes a shortened link and all associated click data
 */
export const DELETE = withAuth('client', withTenant(async (req, _user, orgId, context) => {
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

    // Delete all click records in subcollection
    const clicksSnapshot = await adminDb
      .collection('shortened_links')
      .doc(linkId)
      .collection('clicks')
      .get()

    for (const clickDoc of clicksSnapshot.docs) {
      await clickDoc.ref.delete()
    }

    // Delete the link document
    await adminDb.collection('shortened_links').doc(linkId).delete()

    return apiSuccess({ id: linkId, deleted: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete link'
    return apiError(message, 400)
  }
}))
