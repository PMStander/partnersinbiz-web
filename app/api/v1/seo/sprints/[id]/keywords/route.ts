import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const u = new URL(req.url)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = adminDb.collection('seo_keywords').where('sprintId', '==', id).where('deleted', '==', false)
    for (const f of ['intentBucket', 'status'] as const) {
      const v = u.searchParams.get(f)
      if (v != null) q = q.where(f, '==', v)
    }
    const snap = await q.get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = user.role === 'ai' || !user.orgId ? data : data.filter((d: any) => d.orgId === user.orgId)
    return apiSuccess(filtered, 200, { total: filtered.length, page: 1, limit: filtered.length })
  },
)

export const POST = withAuth(
  'admin',
  withIdempotency(async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const u = new URL(req.url)
    const bulk = u.searchParams.get('bulk') === 'true'
    const sprintSnap = await adminDb.collection('seo_sprints').doc(id).get()
    if (!sprintSnap.exists) return apiError('Sprint not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprint = sprintSnap.data() as any
    if (user.role !== 'ai' && sprint.orgId !== user.orgId) return apiError('Access denied', 403)
    const body = await req.json().catch(() => null)
    if (!body) return apiError('body required', 400)

    type Item = {
      keyword: string
      volume?: number
      topThreeDR?: number
      intentBucket?: string
      targetPageUrl?: string
    }
    const items: Item[] = bulk ? (body.keywords ?? []) : [body]
    if (items.length === 0 || !items[0]?.keyword) return apiError('keyword(s) required', 400)

    const ids: string[] = []
    for (const it of items) {
      if (!it.keyword) continue
      const ref = await adminDb.collection('seo_keywords').add({
        sprintId: id,
        orgId: sprint.orgId,
        keyword: it.keyword,
        volume: it.volume ?? null,
        topThreeDR: it.topThreeDR ?? null,
        intentBucket: it.intentBucket ?? 'solution',
        targetPageUrl: it.targetPageUrl ?? null,
        positions: [],
        status: 'not_yet',
        createdAt: FieldValue.serverTimestamp(),
        deleted: false,
        ...actorFrom(user),
      })
      ids.push(ref.id)
    }
    return apiSuccess({ ids }, 201)
  }),
)
