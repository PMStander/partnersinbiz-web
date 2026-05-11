// app/api/v1/suppressions/check/route.ts
//
// GET /api/v1/suppressions/check?orgId=&email=
//   Quick "is this address suppressed?" probe. Returns the active
//   suppression metadata (or null) so callers don't have to scan the list.

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getSuppression, normalizeEmail } from '@/lib/email/suppressions'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const email = normalizeEmail(searchParams.get('email') ?? '')
  if (!email || !email.includes('@')) return apiError('email is required')

  const s = await getSuppression(orgId, email)
  if (!s) return apiSuccess({ suppressed: false })

  return apiSuccess({
    suppressed: true,
    reason: s.reason,
    scope: s.scope,
    expiresAt: s.expiresAt?.toDate?.()?.toISOString?.() ?? null,
    source: s.source,
  })
})
