/**
 * GET   /api/v1/settings/integrations — read integration settings
 * PATCH /api/v1/settings/integrations — update integration settings
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const BOOL_FIELDS = [
  'googleAnalytics',
  'stripe',
  'payfast',
  'revenuecat',
  'zapier',
  'slack',
  'hubspot',
  'mailchimp',
] as const

const STRING_FIELDS = ['gaTrackingId'] as const

export const GET = withAuth('admin', withTenant(async (_req: NextRequest, _user, orgId: string) => {
  try {
    const doc = await adminDb.collection('organizations').doc(orgId).get()
    if (!doc.exists) return apiError('Organisation not found', 404)

    const integrations = doc.data()!.settings?.integrations ?? {}
    return apiSuccess(integrations)
  } catch (err) {
    console.error('[Settings/Integrations GET] Error:', err)
    return apiError('Failed to fetch integration settings', 500)
  }
}))

export const PATCH = withAuth('admin', withTenant(async (req: NextRequest, _user, orgId: string) => {
  try {
    const doc = await adminDb.collection('organizations').doc(orgId).get()
    if (!doc.exists) return apiError('Organisation not found', 404)

    const body = await req.json().catch(() => ({}))
    const existing = doc.data()!.settings?.integrations ?? {}

    const updated: Record<string, unknown> = { ...existing }
    for (const field of BOOL_FIELDS) {
      if (typeof body[field] === 'boolean') {
        updated[field] = body[field]
      }
    }
    for (const field of STRING_FIELDS) {
      if (typeof body[field] === 'string') {
        updated[field] = body[field].trim()
      }
    }
    updated.updatedAt = FieldValue.serverTimestamp()

    await adminDb.collection('organizations').doc(orgId).update({
      'settings.integrations': updated,
    })

    return apiSuccess({ updated: true })
  } catch (err) {
    console.error('[Settings/Integrations PATCH] Error:', err)
    return apiError('Failed to update integration settings', 500)
  }
}))
