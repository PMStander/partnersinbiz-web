/**
 * GET /api/v1/email/inbound — List inbound emails for an org.
 *
 * Auth: client (admin/ai satisfy via withAuth).
 *
 * Query params:
 *   orgId      — required for admin role; clients are scoped automatically.
 *   processed  — "true" | "false" (filter on processed flag)
 *   intent     — reply | auto-reply | bounce-reply | unsubscribe-reply | unknown
 *   contactId  — filter by matched contact
 *   sequenceId — filter by matched sequence
 *   limit      — 1..500, default 100
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import type { ReplyIntent } from '@/lib/email/inbound/types'

export const dynamic = 'force-dynamic'

const VALID_INTENTS: ReplyIntent[] = [
  'reply',
  'auto-reply',
  'bounce-reply',
  'unsubscribe-reply',
  'unknown',
]

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const processedParam = searchParams.get('processed')
  const intentParam = searchParams.get('intent') as ReplyIntent | null
  const contactId = searchParams.get('contactId') ?? ''
  const sequenceId = searchParams.get('sequenceId') ?? ''
  const limitParam = searchParams.get('limit')
  const limit = limitParam
    ? Math.max(1, Math.min(500, parseInt(limitParam, 10) || 100))
    : 100

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('inbound_emails').where('orgId', '==', orgId)
  if (processedParam === 'true') query = query.where('processed', '==', true)
  else if (processedParam === 'false') query = query.where('processed', '==', false)
  if (intentParam && VALID_INTENTS.includes(intentParam)) {
    query = query.where('intent', '==', intentParam)
  }
  if (contactId) query = query.where('contactId', '==', contactId)
  if (sequenceId) query = query.where('sequenceId', '==', sequenceId)

  const snap = await query.get()
  const items = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((x: any) => x.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => {
      const ax = a.receivedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0
      const bx = b.receivedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0
      return bx - ax
    })
    .slice(0, limit)

  return apiSuccess(items)
})
