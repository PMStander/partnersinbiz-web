// app/api/v1/ads/creatives/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCreative, updateCreative, archiveCreative } from '@/lib/ads/creatives/store'
import type { UpdateAdCreativeInput } from '@/lib/ads/types'
import { logCreativeActivity } from '@/lib/ads/activity'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const c = await getCreative(id)
    if (!c || c.orgId !== orgId) return apiError('Creative not found', 404)

    return apiSuccess(c)
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const c = await getCreative(id)
    if (!c || c.orgId !== orgId) return apiError('Creative not found', 404)

    const patch = (await req.json()) as UpdateAdCreativeInput
    await updateCreative(id, patch)
    const updated = await getCreative(id)
    return apiSuccess(updated)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const c = await getCreative(id)
    if (!c || c.orgId !== orgId) return apiError('Creative not found', 404)

    await archiveCreative(id)

    const actor = {
      id: (user as { uid?: string }).uid ?? 'unknown',
      name: (user as { email?: string }).email ?? 'Admin',
      role: 'admin' as const,
    }
    await logCreativeActivity({
      orgId,
      actor,
      action: 'archived',
      creativeId: id,
      creativeName: c.name,
    })

    return apiSuccess({ archived: true })
  },
)
