import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'
import { apiError, apiErrorFromException } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const DEFAULTS = {
  membersCanDeleteContacts: false,
  membersCanExportContacts: false,
  membersCanSendCampaigns: true,
}

type PermissionKey = keyof typeof DEFAULTS

export const GET = withPortalAuthAndRole('owner', async (_req: NextRequest, _uid: string, orgId: string) => {
  try {
    const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
    const stored = orgDoc.exists ? (orgDoc.data()!.settings?.permissions ?? {}) : {}
    return NextResponse.json({ permissions: { ...DEFAULTS, ...stored } })
  } catch (err) {
    return apiErrorFromException(err)
  }
})

export const PATCH = withPortalAuthAndRole('owner', async (req: NextRequest, _uid: string, orgId: string) => {
  try {
    const body = await req.json().catch(() => ({}))

    const KEYS: PermissionKey[] = ['membersCanDeleteContacts', 'membersCanExportContacts', 'membersCanSendCampaigns']
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    }

    for (const key of KEYS) {
      if (typeof body[key] === 'boolean') {
        updates[`settings.permissions.${key}`] = body[key]
      }
    }

    if (Object.keys(updates).length === 1) {
      // Only updatedAt — no valid toggle provided
      return apiError('At least one permission toggle must be provided', 400)
    }

    await adminDb.collection('organizations').doc(orgId).update(updates)

    // Return the full current state after update
    const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
    const stored = orgDoc.exists ? (orgDoc.data()!.settings?.permissions ?? {}) : {}
    return NextResponse.json({ permissions: { ...DEFAULTS, ...stored } })
  } catch (err) {
    return apiErrorFromException(err)
  }
})
