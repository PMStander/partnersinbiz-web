/**
 * GET   /api/v1/settings/domain — read custom domain settings
 * PATCH /api/v1/settings/domain — update custom domain settings
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', withTenant(async (_req: NextRequest, _user, orgId: string) => {
  try {
    const doc = await adminDb.collection('organizations').doc(orgId).get()
    if (!doc.exists) return apiError('Organisation not found', 404)

    const data = doc.data()!
    const domain = data.settings?.domain ?? {}

    return apiSuccess({
      customDomain: domain.customDomain ?? null,
      sslEnabled: domain.sslEnabled ?? false,
      sslStatus: domain.sslStatus ?? null,
      verifiedAt: domain.verifiedAt ?? null,
    })
  } catch (err) {
    console.error('[Settings/Domain GET] Error:', err)
    return apiError('Failed to fetch domain settings', 500)
  }
}))

export const PATCH = withAuth('admin', withTenant(async (req: NextRequest, _user, orgId: string) => {
  try {
    const doc = await adminDb.collection('organizations').doc(orgId).get()
    if (!doc.exists) return apiError('Organisation not found', 404)

    const body = await req.json().catch(() => ({}))
    const existing = doc.data()!.settings?.domain ?? {}

    const updated: Record<string, unknown> = { ...existing }
    if (typeof body.customDomain === 'string') updated.customDomain = body.customDomain.trim()
    if (typeof body.sslEnabled === 'boolean') updated.sslEnabled = body.sslEnabled
    if (typeof body.sslStatus === 'string') updated.sslStatus = body.sslStatus.trim()
    updated.updatedAt = FieldValue.serverTimestamp()

    await adminDb.collection('organizations').doc(orgId).update({
      'settings.domain': updated,
    })

    return apiSuccess({ updated: true })
  } catch (err) {
    console.error('[Settings/Domain PATCH] Error:', err)
    return apiError('Failed to update domain settings', 500)
  }
}))
