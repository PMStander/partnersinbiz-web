// app/api/v1/recurring-schedules/[id]/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const PATCH = withAuth('admin', async (req: NextRequest, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))

  const doc = await adminDb.collection('recurring_schedules').doc(id).get()
  if (!doc.exists) return apiError('Schedule not found', 404)

  const current = doc.data()!
  if (current.status === 'cancelled') {
    return apiError('Cannot update a cancelled schedule', 409)
  }

  const allowed = ['active', 'paused', 'cancelled']
  if (body.status && !allowed.includes(body.status)) {
    return apiError('status must be active, paused, or cancelled', 400)
  }

  const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() }
  if (body.status) updates.status = body.status

  await adminDb.collection('recurring_schedules').doc(id).update(updates)
  return apiSuccess({ updated: true })
})
