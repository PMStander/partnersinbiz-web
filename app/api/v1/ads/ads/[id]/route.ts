// app/api/v1/ads/ads/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAd, updateAd, deleteAd } from '@/lib/ads/ads/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import { deleteAd as metaDeleteAd } from '@/lib/ads/providers/meta/ads'
import type { UpdateAdInput } from '@/lib/ads/types'
import { logAdActivity } from '@/lib/ads/activity'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ad = await getAd(id)

    if (!ad) return apiError('Ad not found', 404)
    if (ad.orgId !== orgId) return apiError('Ad not found', 404) // tenant isolation

    return apiSuccess(ad)
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    const patch = (await req.json()) as UpdateAdInput
    await updateAd(id, patch)

    // If ad is live in Meta, push the update upstream
    // PATCH limited to: name, status
    // Creative changes require re-create (Meta API limitation — updateAd in meta/ads.ts)
    const warnings: string[] = []
    const metaId = (ad.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaProvider.upsertAd!({
            accessToken: ctx.accessToken,
            adAccountId: ctx.adAccountId,
            ad: { ...ad, ...patch } as any,
            metaAdSetId: (ad.providerData?.meta as { adSetId?: string } | undefined)?.adSetId ?? '',
            pageId: req.headers.get('X-Page-Id') ?? '',
          })
        } catch (err) {
          warnings.push(`Meta sync warning: ${(err as Error).message}`)
        }
      }
    }

    const updated = await getAd(id)
    const responseData = warnings.length ? { ...updated, warnings } : updated
    return apiSuccess(responseData)
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    // Best-effort delete from Meta first
    const metaId = (ad.providerData?.meta as { id?: string } | undefined)?.id
    if (metaId) {
      const ctx = await requireMetaContext(req)
      if (!(ctx instanceof Response)) {
        try {
          await metaDeleteAd({ metaAdId: metaId, accessToken: ctx.accessToken })
        } catch {
          // swallow — local delete is source of truth
        }
      }
    }

    await deleteAd(id)

    const actor = {
      id: (user as { uid?: string }).uid ?? 'unknown',
      name: (user as { email?: string }).email ?? 'Admin',
      role: 'admin' as const,
    }
    await logAdActivity({
      orgId,
      actor,
      action: 'deleted',
      adId: id,
      adName: ad.name,
    })

    return apiSuccess({ deleted: true })
  },
)
