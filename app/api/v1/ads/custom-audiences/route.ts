// app/api/v1/ads/custom-audiences/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listCustomAudiences, createCustomAudience, setCustomAudienceMetaId } from '@/lib/ads/custom-audiences/store'
import { requireMetaContext } from '@/lib/ads/api-helpers'
import { metaProvider } from '@/lib/ads/providers/meta'
import type { AdCustomAudienceType, AdCustomAudienceStatus, CreateAdCustomAudienceInput } from '@/lib/ads/types'
import { logCustomAudienceActivity } from '@/lib/ads/activity'

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const url = new URL(req.url)
  const type = url.searchParams.get('type') as AdCustomAudienceType | null
  const status = url.searchParams.get('status') as AdCustomAudienceStatus | null
  const cas = await listCustomAudiences({
    orgId,
    type: type ?? undefined,
    status: status ?? undefined,
  })
  return apiSuccess(cas)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  const ctx = await requireMetaContext(req)
  if (ctx instanceof Response) return ctx
  const body = (await req.json()) as { input?: CreateAdCustomAudienceInput }
  if (!body.input?.name || !body.input?.type || !body.input?.source) {
    return apiError('Missing required fields: name, type, source', 400)
  }

  // Phase 4: local create first (with status BUILDING for upload-pending types)
  const initialStatus: AdCustomAudienceStatus = 'BUILDING'
  const ca = await createCustomAudience({
    orgId: ctx.orgId,
    createdBy: (user as { uid?: string }).uid ?? 'unknown',
    input: { ...body.input, status: initialStatus },
  })

  // Meta sync (non-CUSTOMER_LIST creates immediately; CUSTOMER_LIST needs upload step)
  try {
    const result = await metaProvider.customAudienceCRUD!({
      op: 'create',
      accessToken: ctx.accessToken,
      adAccountId: ctx.adAccountId,
      ca,
    })
    const metaCaId = (result as { metaCaId: string }).metaCaId
    await setCustomAudienceMetaId(ca.id, metaCaId)
    const updated = await (await import('@/lib/ads/custom-audiences/store')).getCustomAudience(ca.id)

    const actor = {
      id: (user as { uid?: string }).uid ?? 'unknown',
      name: (user as { email?: string }).email ?? 'Admin',
      role: 'admin' as const,
    }
    await logCustomAudienceActivity({
      orgId: ctx.orgId,
      actor,
      action: 'created',
      audienceId: ca.id,
      audienceName: ca.name,
      audienceType: ca.type,
    })

    return apiSuccess(updated, 201)
  } catch (err) {
    // Local doc still exists; surface the Meta error
    return apiError(`Meta sync failed: ${(err as Error).message}`, 500)
  }
})
