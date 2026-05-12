import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError } from '@/lib/api/response'
import {
  callHermesAdminControl,
  requireHermesProfileAccess,
  resolveHermesAdminControl,
} from '@/lib/hermes/server'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string; path?: string[] }> }
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

function splitDashboardPath(parts: string[]) {
  // Back-compat for old generic dashboard proxy calls:
  // /dashboard/v1/models -> control=models
  // /dashboard/api/config -> control=config
  const normalized = parts[0] === 'v1' || parts[0] === 'api' ? parts.slice(1) : parts
  const [control = '', ...path] = normalized
  return { control, path }
}

async function proxyWithAuth(req: NextRequest, user: ApiUser, ctx: unknown, method: Method) {
  const { orgId, path = [] } = await (ctx as RouteContext).params
  const { control, path: controlPath } = splitDashboardPath(path)
  const resolved = resolveHermesAdminControl(control, controlPath, method, req.nextUrl.search)
  if ('error' in resolved) return apiError(resolved.error, resolved.status)

  const access = await requireHermesProfileAccess(user, orgId, resolved.capability)
  if (access instanceof Response) return access

  const body = method === 'GET' || method === 'DELETE' ? undefined : await req.text()
  const result = await callHermesAdminControl(access.link, resolved.path, method, body)

  return NextResponse.json(result.data, { status: result.response.status })
}

export const GET = withAuth('admin', async (req, user, ctx) => proxyWithAuth(req, user, ctx, 'GET'))
export const POST = withAuth('admin', async (req, user, ctx) => proxyWithAuth(req, user, ctx, 'POST'))
export const PUT = withAuth('admin', async (req, user, ctx) => proxyWithAuth(req, user, ctx, 'PUT'))
export const PATCH = withAuth('admin', async (req, user, ctx) => proxyWithAuth(req, user, ctx, 'PATCH'))
export const DELETE = withAuth('admin', async (req, user, ctx) => proxyWithAuth(req, user, ctx, 'DELETE'))
