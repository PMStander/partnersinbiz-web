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

type RouteContext = { params: Promise<{ orgId: string; control: string; path?: string[] }> }
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

async function proxyAdminControl(req: NextRequest, user: ApiUser, ctx: unknown, method: Method) {
  const { orgId, control, path = [] } = await (ctx as RouteContext).params
  const resolved = resolveHermesAdminControl(control, path, method, req.nextUrl.search)
  if ('error' in resolved) return apiError(resolved.error, resolved.status)

  const access = await requireHermesProfileAccess(user, orgId, resolved.capability)
  if (access instanceof Response) return access

  const body = method === 'GET' || method === 'DELETE' ? undefined : await req.text()
  const { response, data } = await callHermesAdminControl(access.link, resolved.path, method, body)
  return NextResponse.json(data, { status: response.status })
}

export const GET = withAuth('admin', async (req, user, ctx) => proxyAdminControl(req, user, ctx, 'GET'))
export const POST = withAuth('admin', async (req, user, ctx) => proxyAdminControl(req, user, ctx, 'POST'))
export const PUT = withAuth('admin', async (req, user, ctx) => proxyAdminControl(req, user, ctx, 'PUT'))
export const PATCH = withAuth('admin', async (req, user, ctx) => proxyAdminControl(req, user, ctx, 'PATCH'))
export const DELETE = withAuth('admin', async (req, user, ctx) => proxyAdminControl(req, user, ctx, 'DELETE'))
