import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const u = new URL(req.url)
    const status = u.searchParams.get('status')
    const result = u.searchParams.get('result')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = adminDb.collection('seo_optimizations').where('sprintId', '==', id).where('deleted', '==', false)
    if (status) q = q.where('status', '==', status)
    if (result) q = q.where('result', '==', result)
    const snap = await q.get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = user.role === 'ai' || !user.orgId ? data : data.filter((d: any) => d.orgId === user.orgId)
    return apiSuccess(filtered, 200, { total: filtered.length, page: 1, limit: filtered.length })
  },
)
