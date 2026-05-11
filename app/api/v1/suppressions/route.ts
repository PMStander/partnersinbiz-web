// app/api/v1/suppressions/route.ts
//
// GET  /api/v1/suppressions?orgId=&reason=&page=&limit=
//        List suppressions for an org. Optional reason filter.
//        Returns paginated rows ordered by createdAt desc.
//
// POST /api/v1/suppressions
//        Body: { orgId, email, reason, notes? }
//        Manually add a suppression (admin override / list cleanup).

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import {
  addSuppression,
  normalizeEmail,
  type SuppressionReason,
} from '@/lib/email/suppressions'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

const REASONS: SuppressionReason[] = [
  'hard-bounce',
  'soft-bounce',
  'complaint',
  'manual-unsub',
  'list-cleanup',
  'invalid-address',
  'disposable-domain',
]

function isReason(v: unknown): v is SuppressionReason {
  return typeof v === 'string' && (REASONS as string[]).includes(v)
}

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const reasonParam = searchParams.get('reason')
  const reason: SuppressionReason | null = isReason(reasonParam) ? reasonParam : null

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('suppressions').where('orgId', '==', orgId)
  if (reason) query = query.where('reason', '==', reason)

  // Use createdAt desc when available; fall back gracefully if the index
  // isn't ready (returns unsorted rows so admins can still see the list).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let snap: any
  try {
    snap = await query.orderBy('createdAt', 'desc').get()
  } catch {
    snap = await query.get()
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = snap.docs.map((d: any) => {
    const data = d.data() ?? {}
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? data.createdAt ?? null,
      expiresAt: data.expiresAt?.toDate?.()?.toISOString?.() ?? data.expiresAt ?? null,
    }
  })

  const total = all.length
  const start = (page - 1) * limit
  const rows = all.slice(start, start + limit)

  return apiSuccess(rows, 200, { total, page, limit })
})

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json().catch(() => ({}))
  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const email = normalizeEmail(typeof body.email === 'string' ? body.email : '')
  if (!email || !email.includes('@')) return apiError('email is required')

  const reasonInput = body.reason
  if (!isReason(reasonInput)) {
    return apiError(`reason must be one of: ${REASONS.join(', ')}`)
  }
  const reason: SuppressionReason = reasonInput

  // soft-bounce manually added → 24h temporary. Anything else → permanent
  // when added by an operator (the whole point of the API is "keep them
  // off the list"). To add a custom expiry, set scope='temporary' explicitly.
  const wantTemporary =
    reason === 'soft-bounce' || body.scope === 'temporary'
  const expiresAt = wantTemporary
    ? (await import('@/lib/email/suppressions')).temporaryExpiryFromNow(24)
    : null

  const actor = actorFrom(user)
  const notes = typeof body.notes === 'string' ? body.notes : undefined

  const { id, upgraded } = await addSuppression({
    orgId,
    email,
    reason,
    source: 'api',
    scope: wantTemporary ? 'temporary' : 'permanent',
    expiresAt,
    details: notes ? { diagnosticCode: notes } : {},
    createdBy: actor.createdBy,
  })

  return apiSuccess({ id, upgraded }, 201)
})
