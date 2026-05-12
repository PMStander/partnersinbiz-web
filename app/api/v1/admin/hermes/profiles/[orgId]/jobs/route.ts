import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import { callHermesJson, requireHermesProfileAccess } from '@/lib/hermes/server'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string }> }

function hermesError(data: unknown, fallback: string) {
  return data && typeof data === 'object' && 'error' in data ? String((data as Record<string, unknown>).error) : fallback
}

function jobsPath(req: NextRequest) {
  const query = req.nextUrl.search
  return `/api/jobs${query}`
}

export const GET = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { orgId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  const { response, data } = await callHermesJson(access.link, jobsPath(req), { method: 'GET' })
  if (!response.ok) return apiError(hermesError(data, 'Hermes jobs request failed'), response.status || 502)
  return NextResponse.json(data, { status: response.status })
})

export const POST = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { orgId } = await (ctx as RouteContext).params
  const access = await requireHermesProfileAccess(user, orgId, 'cron')
  if (access instanceof Response) return access

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON', 400)
  }

  const { response, data } = await callHermesJson(access.link, '/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!response.ok) return apiError(hermesError(data, 'Hermes job creation failed'), response.status || 502, { hermes: data })
  return NextResponse.json(data, { status: response.status || 201 })
})
