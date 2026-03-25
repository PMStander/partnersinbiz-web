// app/api/v1/sequence-enrollments/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const sequenceId = searchParams.get('sequenceId')
  const contactId = searchParams.get('contactId')
  const status = searchParams.get('status')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('sequence_enrollments').orderBy('enrolledAt', 'desc')
  if (sequenceId) query = query.where('sequenceId', '==', sequenceId)
  if (contactId) query = query.where('contactId', '==', contactId)
  if (status) query = query.where('status', '==', status)

  const snap = await query.get()

  // Filter soft-deleted docs in memory (avoids composite index requirement)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((d: any) => d.deleted !== true)
  return apiSuccess(data)
})
