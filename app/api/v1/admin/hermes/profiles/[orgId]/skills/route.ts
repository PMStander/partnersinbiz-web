import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { callHermesJson, requireHermesProfileAccess } from '@/lib/hermes/server'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ orgId: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user, ctx) => {
  const { orgId } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'tools')
  if (access instanceof Response) return access
  const { response, data } = await callHermesJson(access.link, `/admin/skills`)
  // Sidecar is mounted at the same baseUrl as the API server — both are under
  // `/profiles/{profile}/...` on the public host. callHermesJson does NOT know
  // about subpaths, so we append `/admin/skills` to baseUrl which already
  // ends in `/profiles/partners-main`. That's the shape Caddy expects.
  if (!response.ok) return apiError('Failed to list skills', response.status || 502, { upstream: data })
  return apiSuccess(data)
})

export const POST = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { orgId } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'tools')
  if (access instanceof Response) return access

  // Stream the incoming multipart form to the sidecar
  const formData = await req.formData()
  const file = formData.get('file')
  if (!file || typeof file === 'string') return apiError('file is required', 400)
  const upstreamForm = new FormData()
  upstreamForm.append('file', file)

  const url = `${access.link.baseUrl}/admin/skills`
  const headers: Record<string, string> = { Authorization: `Bearer ${access.link.apiKey}` }
  const res = await fetch(url, { method: 'POST', headers, body: upstreamForm })
  const text = await res.text()
  let json: unknown = null
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok) return apiError('Skill upload failed', res.status || 502, { upstream: json })
  return apiSuccess(json)
})
