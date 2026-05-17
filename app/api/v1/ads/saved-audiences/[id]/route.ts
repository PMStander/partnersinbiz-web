import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getSavedAudience, updateSavedAudience, deleteSavedAudience } from '@/lib/ads/saved-audiences/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { deleteMetaSavedAudience } from '@/lib/ads/providers/meta/saved-audiences'
import { metaProvider } from '@/lib/ads/providers/meta'
import type { UpdateAdSavedAudienceInput } from '@/lib/ads/types'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user, ctx: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)
    const { id } = await ctx.params
    const sa = await getSavedAudience(id)
    if (!sa || sa.orgId !== orgId) return apiError('Saved audience not found', 404)
    return apiSuccess(sa)
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)
    const { id } = await ctxParams.params
    const sa = await getSavedAudience(id)
    if (!sa || sa.orgId !== orgId) return apiError('Saved audience not found', 404)

    const patch = (await req.json()) as UpdateAdSavedAudienceInput
    await updateSavedAudience(id, patch)

    // Push to Meta if synced
    const metaSavId = sa.providerData?.meta?.savedAudienceId
    const warnings: string[] = []
    if (metaSavId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaProvider.savedAudienceCRUD!({
            op: 'update',
            accessToken: ctx.accessToken,
            metaSavId,
            patch,
          })
        } catch (err) {
          warnings.push(`Meta sync warning: ${(err as Error).message}`)
        }
      }
    }

    const updated = await getSavedAudience(id)
    return apiSuccess(updated)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, _user, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)
    const { id } = await ctxParams.params
    const sa = await getSavedAudience(id)
    if (!sa || sa.orgId !== orgId) return apiError('Saved audience not found', 404)

    const metaSavId = sa.providerData?.meta?.savedAudienceId
    if (metaSavId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await deleteMetaSavedAudience({ metaSavId, accessToken: ctx.accessToken })
        } catch {
          // best-effort
        }
      }
    }
    await deleteSavedAudience(id)
    return apiSuccess({ deleted: true })
  },
)
