import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { callHermesJson, requireHermesProfileAccess } from '@/lib/hermes/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string; jobId: string }> }

function hermesError(data: unknown, fallback: string) {
  return data && typeof data === 'object' && 'error' in data ? String((data as Record<string, unknown>).error) : fallback
}

export const POST = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { orgId, jobId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  const body = await req.text()
  const { response, data } = await callHermesJson(access.link, `/api/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
    ...(body ? { body } : {}),
  })
  if (!response.ok) return apiError(hermesError(data, 'Hermes job pause failed'), response.status || 502, { hermes: data })
  return NextResponse.json(data, { status: response.status })
})
