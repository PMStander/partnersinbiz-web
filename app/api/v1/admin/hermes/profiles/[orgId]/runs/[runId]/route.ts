import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { requireHermesProfileAccess, callHermesJson } from '@/lib/hermes/server'
import { apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string; runId: string }> }

export const GET = withAuth('admin', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { orgId, runId } = await ctx.params
  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof NextResponse) return access
  const { link } = access

  const { response, data } = await callHermesJson(link, `/v1/runs/${encodeURIComponent(runId)}`, { method: 'GET' })
  if (!response.ok) {
    return apiError(
      data && typeof data === 'object' && 'error' in data ? String((data as Record<string, unknown>).error) : 'Hermes error',
      response.status,
    )
  }
  return NextResponse.json(data)
})
