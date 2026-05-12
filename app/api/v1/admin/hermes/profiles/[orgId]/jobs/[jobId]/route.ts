import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { callHermesJson, requireHermesProfileAccess } from '@/lib/hermes/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string; jobId: string }> }

function hermesError(data: unknown, fallback: string) {
  return data && typeof data === 'object' && 'error' in data ? String((data as Record<string, unknown>).error) : fallback
}

function jobPath(jobId: string) {
  return `/api/jobs/${encodeURIComponent(jobId)}`
}

async function parseJsonBody(req: NextRequest) {
  try {
    return { body: await req.json() as unknown }
  } catch {
    return { error: apiError('Invalid JSON', 400) }
  }
}

export const GET = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const { orgId, jobId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  const { response, data } = await callHermesJson(access.link, jobPath(jobId), { method: 'GET' })
  if (!response.ok) return apiError(hermesError(data, 'Hermes job request failed'), response.status || 502)
  return NextResponse.json(data, { status: response.status })
})

export const PUT = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { orgId, jobId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  const parsed = await parseJsonBody(req)
  if (parsed.error) return parsed.error

  const { response, data } = await callHermesJson(access.link, jobPath(jobId), {
    method: 'PUT',
    body: JSON.stringify(parsed.body),
  })
  if (!response.ok) return apiError(hermesError(data, 'Hermes job update failed'), response.status || 502, { hermes: data })
  return NextResponse.json(data, { status: response.status })
})

export const PATCH = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { orgId, jobId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  const parsed = await parseJsonBody(req)
  if (parsed.error) return parsed.error

  const { response, data } = await callHermesJson(access.link, jobPath(jobId), {
    method: 'PATCH',
    body: JSON.stringify(parsed.body),
  })
  if (!response.ok) return apiError(hermesError(data, 'Hermes job update failed'), response.status || 502, { hermes: data })
  return NextResponse.json(data, { status: response.status })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const { orgId, jobId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  const { response, data } = await callHermesJson(access.link, jobPath(jobId), { method: 'DELETE' })
  if (!response.ok) return apiError(hermesError(data, 'Hermes job deletion failed'), response.status || 502, { hermes: data })
  if (response.status === 204) return new Response(null, { status: 204 })
  return NextResponse.json(data ?? { deleted: true }, { status: response.status })
})
