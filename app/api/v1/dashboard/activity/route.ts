// app/api/v1/dashboard/activity/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest, _user) => {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  const snap = await (adminDb.collection('activities') as any)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})
