// app/api/v1/ads/custom-audiences/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getCustomAudience, updateCustomAudience, deleteCustomAudience } from '@/lib/ads/custom-audiences/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import type { UpdateAdCustomAudienceInput } from '@/lib/ads/types'
import { logCustomAudienceActivity } from '@/lib/ads/activity'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ca = await getCustomAudience(id)

    if (!ca) return apiError('Custom audience not found', 404)
    if (ca.orgId !== orgId) return apiError('Custom audience not found', 404) // tenant isolation

    return apiSuccess(ca)
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ca = await getCustomAudience(id)
    if (!ca || ca.orgId !== orgId) return apiError('Custom audience not found', 404)

    const patch = (await req.json()) as UpdateAdCustomAudienceInput
    await updateCustomAudience(id, patch)

    const updated = await getCustomAudience(id)
    return apiSuccess(updated)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ca = await getCustomAudience(id)
    if (!ca || ca.orgId !== orgId) return apiError('Custom audience not found', 404)

    // Best-effort delete from Meta first
    const metaCaId = ca.providerData?.meta?.customAudienceId
    if (metaCaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaProvider.customAudienceCRUD!({
            op: 'delete',
            accessToken: ctx.accessToken,
            metaCaId,
          })
        } catch {
          // swallow — local delete is source of truth
        }
      }
    }

    await deleteCustomAudience(id)

    const actor = {
      id: (user as { uid?: string }).uid ?? 'unknown',
      name: (user as { email?: string }).email ?? 'Admin',
      role: 'admin' as const,
    }
    await logCustomAudienceActivity({
      orgId,
      actor,
      action: 'deleted',
      audienceId: id,
      audienceName: ca.name,
      audienceType: ca.type,
    })

    return apiSuccess({ deleted: true })
  },
)
