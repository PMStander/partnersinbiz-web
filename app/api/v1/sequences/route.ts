// app/api/v1/sequences/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('sequences').orderBy('createdAt', 'desc')
  if (status) query = query.where('status', '==', status)

  const snap = await query.get()

  // Filter soft-deleted docs in memory (avoids composite index requirement)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((d: any) => d.deleted !== true)
  const total = data.length
  data = data.slice((page - 1) * limit, page * limit)

  return apiSuccess(data, 200, { total, page, limit })
})

export const POST = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const body = await req.json().catch(() => null)
  if (!body?.name) return apiError('name is required', 400)

  const ref = await adminDb.collection('sequences').add({
    name: body.name,
    description: body.description ?? '',
    status: body.status ?? 'draft',
    steps: body.steps ?? [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  })
  return apiSuccess({ id: ref.id, ...body }, 201)
})
