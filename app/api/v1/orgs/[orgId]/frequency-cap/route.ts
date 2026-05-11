// app/api/v1/orgs/[orgId]/frequency-cap/route.ts
//
// GET / PUT the org's per-contact frequency cap (max emails per 24h / 7d).
// Stored on `organizations/{orgId}.settings.frequencyCap`.

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getOrgFrequencyCap, setOrgFrequencyCap } from '@/lib/email/frequency'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ orgId: string }> }

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { orgId: orgIdParam } = await (context as Params).params
    const scope = resolveOrgScope(user, orgIdParam)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const cap = await getOrgFrequencyCap(scope.orgId)
    return apiSuccess(cap)
  },
)

export const PUT = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { orgId: orgIdParam } = await (context as Params).params
    const scope = resolveOrgScope(user, orgIdParam)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('invalid JSON body', 400)
    const cap = await setOrgFrequencyCap(scope.orgId, body)
    return apiSuccess(cap)
  },
)
