// app/api/v1/portal/settings/team/[uid]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'
import { apiError, apiErrorFromException } from '@/lib/api/response'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

export const DELETE = withPortalAuthAndRole(
  'admin',
  async (_req: NextRequest, uid: string, orgId: string, _role: OrgRole, { params }: { params: Promise<{ uid: string }> }) => {
    try {
      const { uid: targetUid } = await params

      if (targetUid === uid) {
        return apiError('You cannot remove yourself', 400)
      }

      const orgRef = adminDb.collection('organizations').doc(orgId)
      const orgDoc = await orgRef.get()

      const batch = adminDb.batch()

      batch.update(adminDb.collection('users').doc(targetUid), {
        orgIds: FieldValue.arrayRemove(orgId),
        updatedAt: FieldValue.serverTimestamp(),
      })

      if (orgDoc.exists) {
        const members: Array<{ userId: string; role: string }> = orgDoc.data()!.members ?? []
        const member = members.find((m) => m.userId === targetUid)
        if (member) {
          batch.update(orgRef, {
            members: FieldValue.arrayRemove(member),
            updatedAt: FieldValue.serverTimestamp(),
          })
        }
      }

      batch.delete(adminDb.collection('orgMembers').doc(`${orgId}_${targetUid}`))

      await batch.commit()

      return NextResponse.json({ removed: targetUid })
    } catch (err) {
      return apiErrorFromException(err)
    }
  }
)
