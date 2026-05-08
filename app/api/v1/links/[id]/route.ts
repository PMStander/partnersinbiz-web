/**
 * GET    /api/v1/links/[id]  — get link details + click analytics
 * PUT    /api/v1/links/[id]  — update link metadata (propertyId, originalUrl, utm)
 * DELETE /api/v1/links/[id]  — remove a shortened link
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
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
 * PUT /api/v1/links/[id]
 * Updates link metadata. Allowed fields: propertyId (string|null), originalUrl,
 * utmSource, utmMedium, utmCampaign, utmTerm, utmContent.
 */
export const PUT = withAuth('client', withTenant(async (req, _user, orgId, context) => {
  const params = context?.params as { id: string } | undefined
  const linkId = params?.id
  if (!linkId) return apiError('Link ID is required')

  try {
    const ref = adminDb.collection('shortened_links').doc(linkId)
    const doc = await ref.get()
    if (!doc.exists) return apiError('Link not found', 404)
    if ((doc.data() as ShortenedLink).orgId !== orgId) return apiError('Forbidden', 403)

    const body = await req.json().catch(() => ({}))
    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }

    if ('propertyId' in body) {
      const v = body.propertyId
      if (v === null || v === '') updates.propertyId = FieldValue.delete()
      else if (typeof v === 'string') updates.propertyId = v
    }
    if (typeof body.originalUrl === 'string') {
      try { new URL(body.originalUrl) } catch { return apiError('originalUrl must be a valid URL') }
      updates.originalUrl = body.originalUrl
    }
    for (const k of ['utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent'] as const) {
      if (k in body) {
        const v = body[k]
        if (v === null || v === '') updates[k] = FieldValue.delete()
        else if (typeof v === 'string') updates[k] = v
      }
    }

    await ref.update(updates)
    const fresh = await ref.get()
    return apiSuccess({ id: linkId, ...fresh.data() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update link'
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
