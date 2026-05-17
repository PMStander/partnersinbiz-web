// app/api/v1/ads/keywords/[id]/route.ts
// Get + Patch + Delete for a single canonical ad keyword — admin only.
// Sub-3a Phase 2 Batch 2.

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getKeyword, updateKeyword, deleteKeyword } from '@/lib/ads/keywords/store'
import type { AdEntityStatus } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function loadKeyword(orgId: string, id: string) {
  const kw = await getKeyword(id)
  if (!kw || kw.orgId !== orgId) return null // single 404 covers both missing + wrong tenant
  return kw
}

export const GET = withAuth('admin', async (req: NextRequest, _u: unknown, ctx?: unknown) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const { id } = await (ctx as Ctx).params
  const kw = await loadKeyword(orgId, id)
  if (!kw) return apiError('Keyword not found', 404)
  return apiSuccess({ keyword: kw })
})

const VALID_STATUS: AdEntityStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'PENDING_REVIEW']

export const PATCH = withAuth('admin', async (req: NextRequest, _u: unknown, ctx?: unknown) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const { id } = await (ctx as Ctx).params
  const kw = await loadKeyword(orgId, id)
  if (!kw) return apiError('Keyword not found', 404)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

  const patch: Parameters<typeof updateKeyword>[1] = {}
  if (typeof body.text === 'string' && body.text.trim()) {
    if (body.text.length > 80) return apiError('Keyword text exceeds 80 chars', 400)
    patch.text = body.text
  }
  if (typeof body.status === 'string') {
    if (!VALID_STATUS.includes(body.status as AdEntityStatus)) {
      return apiError(`status must be one of: ${VALID_STATUS.join(', ')}`, 400)
    }
    patch.status = body.status as AdEntityStatus
  }
  if (typeof body.cpcBidMicros === 'string') patch.cpcBidMicros = body.cpcBidMicros

  if (Object.keys(patch).length === 0) return apiError('No editable fields supplied', 400)

  try {
    const updated = await updateKeyword(id, patch)
    return apiSuccess({ keyword: updated })
  } catch (err) {
    return apiError((err as Error).message ?? 'Update keyword failed', 500)
  }
})

export const DELETE = withAuth('admin', async (req: NextRequest, _u: unknown, ctx?: unknown) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const { id } = await (ctx as Ctx).params
  const kw = await loadKeyword(orgId, id)
  if (!kw) return apiError('Keyword not found', 404)

  await deleteKeyword(id)
  return apiSuccess({ id })
})
