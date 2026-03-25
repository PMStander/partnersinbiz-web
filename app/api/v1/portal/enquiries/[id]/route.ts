// app/api/v1/portal/enquiries/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withPortalAuth(async (req: NextRequest, uid: string, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('enquiries').doc(id).get()
  if (!snap.exists) return apiError('Not found', 404)
  const data = snap.data()!
  if (data.userId !== uid) return apiError('Forbidden', 403)
  return apiSuccess({ id: snap.id, ...data })
}) as any
