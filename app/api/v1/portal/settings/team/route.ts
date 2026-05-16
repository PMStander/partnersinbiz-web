// app/api/v1/portal/settings/team/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'
import { apiErrorFromException } from '@/lib/api/response'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuthAndRole('viewer', async (_req: NextRequest, _uid: string, orgId: string) => {
  try {
    const snapshot = await adminDb
      .collection('orgMembers')
      .where('orgId', '==', orgId)
      .get()

    const members = snapshot.docs.map((d) => {
      const data = d.data()
      return {
        uid: data.uid as string,
        firstName: (data.firstName as string) ?? '',
        lastName: (data.lastName as string) ?? '',
        jobTitle: (data.jobTitle as string) ?? '',
        avatarUrl: (data.avatarUrl as string) ?? '',
        role: data.role as OrgRole,
      }
    })

    return NextResponse.json({ members })
  } catch (err) {
    return apiErrorFromException(err)
  }
})
