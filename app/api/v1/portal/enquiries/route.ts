// app/api/v1/portal/enquiries/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuth(async (req: NextRequest, uid: string) => {
  const snap = await (adminDb.collection('enquiries') as any)
    .where('userId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})
