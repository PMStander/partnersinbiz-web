import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listSavedAudiences, createSavedAudience, setSavedAudienceMetaId, getSavedAudience } from '@/lib/ads/saved-audiences/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import type { CreateAdSavedAudienceInput } from '@/lib/ads/types'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const sas = await listSavedAudiences({ orgId })
  return apiSuccess(sas)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const ctx = await requireMetaContext(req)
  if (ctx instanceof Response) return ctx
  const body = (await req.json()) as { input?: CreateAdSavedAudienceInput }
  if (!body.input?.name || !body.input?.targeting) {
    return apiError('Missing required fields: name, targeting', 400)
  }

  const sa = await createSavedAudience({
    orgId: ctx.orgId,
    createdBy: (user as { uid?: string }).uid ?? 'unknown',
    input: body.input,
  })

  try {
    const result = await metaProvider.savedAudienceCRUD!({
      op: 'create',
      accessToken: ctx.accessToken,
      adAccountId: ctx.adAccountId,
      sa,
    })
    const metaSavId = (result as { metaSavId: string }).metaSavId
    await setSavedAudienceMetaId(sa.id, metaSavId)
    const updated = await getSavedAudience(sa.id)
    return apiSuccess(updated, 201)
  } catch (err) {
    return apiError(`Meta sync failed: ${(err as Error).message}`, 500)
  }
})
