import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiError, apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

function cleanObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

export const GET = withPortalAuthAndRole('viewer', async (_req: NextRequest, _uid, orgId) => {
  const doc = await adminDb.collection('organizations').doc(orgId).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const data = doc.data() ?? {}
  return apiSuccess({
    org: {
      id: orgId,
      name: data.name ?? '',
      slug: data.slug ?? '',
    },
    brandProfile: data.brandProfile ?? {},
    brandColors: data.settings?.brandColors ?? {},
  })
})

export const PUT = withPortalAuthAndRole('member', async (req: NextRequest, _uid, orgId) => {
  const doc = await adminDb.collection('organizations').doc(orgId).get()
  if (!doc.exists) return apiError('Organisation not found', 404)

  const body = await req.json().catch(() => ({}))
  const brandProfile = cleanObject(body.brandProfile)
  const brandColors = cleanObject(body.brandColors)
  const existingSettings = doc.data()?.settings ?? {}

  await adminDb.collection('organizations').doc(orgId).update({
    brandProfile,
    settings: { ...existingSettings, brandColors },
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ updated: true })
})
