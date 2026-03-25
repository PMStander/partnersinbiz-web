// app/api/v1/sequence-enrollments/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const sequenceId = searchParams.get('sequenceId')
  const contactId = searchParams.get('contactId')
  const status = searchParams.get('status')

  let query = (adminDb.collection('sequence_enrollments') as any).where('deleted', '!=', true)
  if (sequenceId) query = query.where('sequenceId', '==', sequenceId)
  if (contactId) query = query.where('contactId', '==', contactId)
  if (status) query = query.where('status', '==', status)
  query = query.orderBy('enrolledAt', 'desc')

  const snap = await query.get()
  const data = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  return apiSuccess(data)
})
