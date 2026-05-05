import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateAuditSnapshot } from '@/lib/seo/audits'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const snap = await adminDb
      .collection('seo_audits')
      .where('sprintId', '==', id)
      .where('deleted', '==', false)
      .get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = user.role === 'ai' || !user.orgId ? data : data.filter((d: any) => d.orgId === user.orgId)
    return apiSuccess(filtered)
  },
)

export const POST = withAuth(
  'admin',
  withIdempotency(async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const sprintSnap = await adminDb.collection('seo_sprints').doc(id).get()
    if (!sprintSnap.exists) return apiError('Sprint not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprint = sprintSnap.data() as any
    if (user.role !== 'ai' && sprint.orgId !== user.orgId) return apiError('Access denied', 403)
    const body = await req.json().catch(() => ({}))
    const snapshotDay = body.snapshotDay ?? sprint.currentDay ?? 0
    const auditId = await generateAuditSnapshot(id, snapshotDay)
    return apiSuccess({ id: auditId, snapshotDay }, 201)
  }),
)
