// app/api/v1/recurring-schedules/route.ts
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'active'

  let query = adminDb.collection('recurring_schedules').orderBy('createdAt', 'desc') as any
  if (status !== 'all') query = query.where('status', '==', status)

  const snap = await query.limit(100).get()
  const schedules = snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(schedules)
})
