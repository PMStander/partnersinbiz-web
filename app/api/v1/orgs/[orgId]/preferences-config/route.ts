// app/api/v1/orgs/[orgId]/preferences-config/route.ts
//
// GET  — load the org's preferences-page config (topics, default frequency,
//        page copy, master toggle). Falls back to sensible defaults if
//        nothing's stored.
// PUT  — admin / ai / client (same-org) updates. Partial update.
//
// The result of this is consumed by:
//   - `app/preferences/[token]/page.tsx` (public preferences page)
//   - `lib/preferences/store.ts#shouldSendToContact` (send-time gate)
//   - the admin email-preferences page.

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  getOrgPreferencesConfig,
  setOrgPreferencesConfig,
} from '@/lib/preferences/store'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ orgId: string }> }

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { orgId: orgIdParam } = await (context as Params).params
    const scope = resolveOrgScope(user, orgIdParam)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const cfg = await getOrgPreferencesConfig(scope.orgId)
    return apiSuccess(cfg)
  },
)

export const PUT = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { orgId: orgIdParam } = await (context as Params).params
    const scope = resolveOrgScope(user, orgIdParam)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const orgId = scope.orgId

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('invalid JSON body', 400)

    const next = await setOrgPreferencesConfig(orgId, body)
    return apiSuccess(next)
  },
)
