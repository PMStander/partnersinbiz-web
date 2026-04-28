/**
 * GET   /api/v1/settings/features — read feature flag settings
 * PATCH /api/v1/settings/features — update feature flag settings
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const KNOWN_FLAGS = [
  'socialPosting',
  'contentVault',
  'aiAssist',
  'clientPortal',
  'reporting',
  'analytics',
  'emailCampaigns',
  'crmContacts',
  'revenueTracking',
  'notifications',
  'apiAccess',
  'whiteLabel',
  'multiUser',
  'advancedReports',
] as const

export const GET = withAuth('admin', withTenant(async (_req: NextRequest, _user, orgId: string) => {
  try {
    const doc = await adminDb.collection('organizations').doc(orgId).get()
    if (!doc.exists) return apiError('Organisation not found', 404)

    const features = doc.data()!.settings?.features ?? {}
    return apiSuccess(features)
  } catch (err) {
    console.error('[Settings/Features GET] Error:', err)
    return apiError('Failed to fetch feature settings', 500)
  }
}))

export const PATCH = withAuth('admin', withTenant(async (req: NextRequest, _user, orgId: string) => {
  try {
    const doc = await adminDb.collection('organizations').doc(orgId).get()
    if (!doc.exists) return apiError('Organisation not found', 404)

    const body = await req.json().catch(() => ({}))
    const existing = doc.data()!.settings?.features ?? {}

    const updated: Record<string, unknown> = { ...existing }
    for (const flag of KNOWN_FLAGS) {
      if (typeof body[flag] === 'boolean') {
        updated[flag] = body[flag]
      }
    }
    updated.updatedAt = FieldValue.serverTimestamp()

    await adminDb.collection('organizations').doc(orgId).update({
      'settings.features': updated,
    })

    return apiSuccess({ updated: true })
  } catch (err) {
    console.error('[Settings/Features PATCH] Error:', err)
    return apiError('Failed to update feature settings', 500)
  }
}))
