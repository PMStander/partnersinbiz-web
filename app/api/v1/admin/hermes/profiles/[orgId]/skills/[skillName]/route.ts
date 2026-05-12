import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { callHermesJson, requireHermesProfileAccess } from '@/lib/hermes/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ orgId: string; skillName: string }> }

export const DELETE = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const { orgId, skillName } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'tools')
  if (access instanceof Response) return access
  if (!/^[A-Za-z0-9._-]+$/.test(skillName)) return apiError('invalid skill name', 400)
  const { response, data } = await callHermesJson(access.link, `/admin/skills/${encodeURIComponent(skillName)}`, {
    method: 'DELETE',
  })
  if (!response.ok) return apiError('Failed to delete skill', response.status || 502, { upstream: data })
  return apiSuccess(data)
})
