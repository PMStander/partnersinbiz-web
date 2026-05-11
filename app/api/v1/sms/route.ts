/**
 * GET /api/v1/sms — list SMS messages
 *
 * Query params:
 *   direction   — "outbound" | "inbound"
 *   status      — "queued" | "sent" | "delivered" | "failed" | "undelivered"
 *   contactId   — filter by linked contact
 *   sequenceId  — filter by sequence
 *   campaignId  — filter by campaign
 *   broadcastId — filter by broadcast
 *   limit       — default 50, max 200
 *   page        — default 1
 *
 * Auth: client (admin/ai satisfy).
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Sms, SmsDirection, SmsStatus } from '@/lib/sms/types'

const VALID_DIRECTIONS: SmsDirection[] = ['outbound', 'inbound']
const VALID_STATUSES: SmsStatus[] = ['queued', 'sent', 'delivered', 'failed', 'undelivered']

export const GET = withAuth('client', async (req: NextRequest, user) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const direction = searchParams.get('direction') as SmsDirection | null
  const status = searchParams.get('status') as SmsStatus | null
  const contactId = searchParams.get('contactId') ?? ''
  const sequenceId = searchParams.get('sequenceId') ?? ''
  const campaignId = searchParams.get('campaignId') ?? ''
  const broadcastId = searchParams.get('broadcastId') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10) || 1, 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('sms').orderBy('createdAt', 'desc')

  if (orgId) query = query.where('orgId', '==', orgId)
  if (direction && VALID_DIRECTIONS.includes(direction)) {
    query = query.where('direction', '==', direction)
  }
  if (status && VALID_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }
  if (contactId) query = query.where('contactId', '==', contactId)
  if (sequenceId) query = query.where('sequenceId', '==', sequenceId)
  if (campaignId) query = query.where('campaignId', '==', campaignId)
  if (broadcastId) query = query.where('broadcastId', '==', broadcastId)

  const snapshot = await query.get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: Sms[] = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }) as Sms)
    .filter((r: Sms & { deleted?: boolean }) => r.deleted !== true)

  const total = rows.length
  rows = rows.slice((page - 1) * limit, page * limit)

  return apiSuccess(rows, 200, { total, page, limit })
})
