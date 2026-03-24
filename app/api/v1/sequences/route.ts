// app/api/v1/sequences/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const page = parseInt(searchParams.get('page') ?? '1')

  let query = (adminDb.collection('sequences') as any).where('deleted', '!=', true)
  if (status) query = query.where('status', '==', status)
  query = query.orderBy('createdAt', 'desc').limit(limit).offset((page - 1) * limit)

  const snap = await query.get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})

export const POST = withAuth('admin', async (req: NextRequest) => {
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
