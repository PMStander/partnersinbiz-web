/**
 * POST /api/v1/crm/activities  — log an activity
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ActivityInput, ActivityType } from '@/lib/crm/types'

const VALID_TYPES: ActivityType[] = [
  'email_sent', 'email_received', 'call', 'note',
  'stage_change', 'sequence_enrolled', 'sequence_completed',
]

export const POST = withAuth('admin', async (req, user) => {
  const body = await req.json() as ActivityInput
  if (!body.contactId?.trim()) return apiError('contactId is required')
  if (!body.type || !VALID_TYPES.includes(body.type)) return apiError('Invalid activity type')
  if (!body.summary?.trim()) return apiError('summary is required')

  const docRef = await adminDb.collection('activities').add({
    contactId: body.contactId.trim(),
    dealId: body.dealId ?? '',
    type: body.type,
    summary: body.summary.trim(),
    metadata: body.metadata ?? {},
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id: docRef.id }, 201)
})
