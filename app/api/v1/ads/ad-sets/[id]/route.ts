// app/api/v1/ads/ad-sets/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAdSet, updateAdSet, deleteAdSet } from '@/lib/ads/adsets/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import { deleteAdSet as metaDeleteAdSet } from '@/lib/ads/providers/meta/adsets'
import type { UpdateAdSetInput } from '@/lib/ads/types'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const adSet = await getAdSet(id)

    if (!adSet) return apiError('Ad set not found', 404)
    if (adSet.orgId !== orgId) return apiError('Ad set not found', 404) // tenant isolation

    return apiSuccess(adSet)
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const adSet = await getAdSet(id)
    if (!adSet || adSet.orgId !== orgId) return apiError('Ad set not found', 404)

    const patch = (await req.json()) as UpdateAdSetInput
    await updateAdSet(id, patch)

    // If ad set is live in Meta, push the update upstream
    // PATCH limited to: name, status, dailyBudget, lifetimeBudget, bidAmount
    // Targeting changes require re-create (Meta API limitation)
    const warnings: string[] = []
    const metaId = (adSet.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaProvider.upsertAdSet!({
            accessToken: ctx.accessToken,
            adAccountId: ctx.adAccountId,
            adSet: { ...adSet, ...patch } as any,
            metaCampaignId: (adSet.providerData?.meta as { campaignId?: string } | undefined)?.campaignId ?? '',
          })
        } catch (err) {
          warnings.push(`Meta sync warning: ${(err as Error).message}`)
        }
      }
    }

    const updated = await getAdSet(id)
    const responseData = warnings.length ? { ...updated, warnings } : updated
    return apiSuccess(responseData)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const adSet = await getAdSet(id)
    if (!adSet || adSet.orgId !== orgId) return apiError('Ad set not found', 404)

    // Best-effort delete from Meta first
    const metaId = (adSet.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaDeleteAdSet({ metaAdSetId: metaId, accessToken: ctx.accessToken })
        } catch {
          // swallow — local delete is source of truth
        }
      }
    }

    await deleteAdSet(id)
    return apiSuccess({ deleted: true })
  },
)
