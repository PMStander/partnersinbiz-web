// app/api/v1/ads/google/merchant-center/[id]/route.ts
//
// GET    /api/v1/ads/google/merchant-center/:id  — fetch a single binding
// PATCH  /api/v1/ads/google/merchant-center/:id  — update primaryFeedId
// DELETE /api/v1/ads/google/merchant-center/:id  — remove binding
//
// All routes enforce org-scoped ownership: if the binding doesn't belong to
// the requesting org the response is 404 (not 403) to avoid leaking IDs.
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  getMerchantCenter,
  updateMerchantCenter,
  deleteMerchantCenter,
} from '@/lib/ads/merchant-center/store'
import type { AdMerchantCenter } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Load binding and enforce org ownership. Returns null if not found or wrong org. */
async function loadBinding(orgId: string, id: string): Promise<AdMerchantCenter | null> {
  const b = await getMerchantCenter(id)
  if (!b || b.orgId !== orgId) return null
  return b
}

/** Strip token refs before returning to the client. */
function safeBinding(b: AdMerchantCenter) {
  const { accessTokenRef: _a, refreshTokenRef: _r, ...rest } = b
  return rest
}

export const GET = withAuth('admin', async (req: NextRequest, _u: unknown, ctx?: unknown) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const { id } = await (ctx as Ctx).params
  const b = await loadBinding(orgId, id)
  if (!b) return apiError('Merchant Center binding not found', 404)
  return apiSuccess({ binding: safeBinding(b) })
})

export const PATCH = withAuth('admin', async (req: NextRequest, _u: unknown, ctx?: unknown) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const { id } = await (ctx as Ctx).params
  const b = await loadBinding(orgId, id)
  if (!b) return apiError('Merchant Center binding not found', 404)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON', 400)
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.primaryFeedId === 'string') patch.primaryFeedId = body.primaryFeedId

  if (Object.keys(patch).length === 0) return apiError('No editable fields supplied', 400)

  const updated = await updateMerchantCenter(id, patch as Partial<AdMerchantCenter>)
  return apiSuccess({ binding: safeBinding(updated) })
})

export const DELETE = withAuth('admin', async (req: NextRequest, _u: unknown, ctx?: unknown) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const { id } = await (ctx as Ctx).params
  const b = await loadBinding(orgId, id)
  if (!b) return apiError('Merchant Center binding not found', 404)
  await deleteMerchantCenter(id)
  return apiSuccess({ id })
})
