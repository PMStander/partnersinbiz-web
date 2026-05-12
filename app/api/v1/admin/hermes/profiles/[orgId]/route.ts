import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { isSuperAdmin } from '@/lib/api/platformAdmin'
import {
  getHermesProfileLink,
  publicHermesProfileLink,
  requireHermesProfileAccess,
  saveHermesProfileLink,
} from '@/lib/hermes/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string }> }

export const GET = withAuth('client', async (_req, user, ctx) => {
  const { orgId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'dashboard')
  if (access instanceof Response) return access
  return apiSuccess(publicHermesProfileLink(access.link))
})

export const PUT = withAuth('admin', async (req: NextRequest, user, ctx) => {
  if (!isSuperAdmin(user)) return apiError('Only super admins can configure Hermes profile links', 403)
  const { orgId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))
  try {
    const existing = await getHermesProfileLink(orgId)
    const saved = await saveHermesProfileLink(orgId, user, {
      ...body,
      existingApiKey: typeof body.apiKey === 'string' && body.apiKey.trim() ? undefined : existing?.apiKey,
      existingDashboardSessionToken: typeof body.dashboardSessionToken === 'string' && body.dashboardSessionToken.trim() ? undefined : existing?.dashboardSessionToken,
    })
    return apiSuccess(publicHermesProfileLink(saved))
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Invalid Hermes profile link', 400)
  }
})

export const DELETE = withAuth('admin', async (_req, user, ctx) => {
  if (!isSuperAdmin(user)) return apiError('Only super admins can disable Hermes profile links', 403)
  const { orgId } = await (ctx as RouteContext).params
  const existing = await getHermesProfileLink(orgId)
  if (!existing) return apiError('Hermes profile link not found', 404)
  const saved = await saveHermesProfileLink(orgId, user, { ...existing, enabled: false, existingApiKey: existing.apiKey, existingDashboardSessionToken: existing.dashboardSessionToken })
  return apiSuccess(publicHermesProfileLink(saved))
})
