/**
 * GET    /api/v1/crm/integrations/[id]
 * PUT    /api/v1/crm/integrations/[id]    — partial update (name, config, autoTags, autoCampaignIds, cadenceMinutes, status)
 * PATCH  /api/v1/crm/integrations/[id]    — alias for PUT
 * DELETE /api/v1/crm/integrations/[id]    — soft-delete
 *
 * Auth: admin+
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth, type CrmAuthContext } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { findProvider, toPublicView, type CrmIntegration } from '@/lib/crm/integrations/types'
import { encryptCredentials, decryptCredentials } from '@/lib/integrations/crypto'

const COLLECTION = 'crm_integrations'

type RouteCtx = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// Tenant-scoped loader — returns 404 for missing OR cross-org documents
// ---------------------------------------------------------------------------

async function loadIntegration(id: string, ctxOrgId: string) {
  const ref = adminDb.collection(COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false as const, status: 404, error: 'Integration not found' }
  const data = snap.data()!
  if (data.orgId !== ctxOrgId) return { ok: false as const, status: 404, error: 'Integration not found' }
  if (data.deleted === true) return { ok: false as const, status: 404, error: 'Integration not found' }
  return { ok: true as const, ref, data }
}

// ---------------------------------------------------------------------------
// GET — admin+
// ---------------------------------------------------------------------------

export const GET = withCrmAuth<RouteCtx>('admin', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const r = await loadIntegration(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  // Decrypt configEnc for in-memory use; toPublicView returns only configPreview (redacted)
  let config: Record<string, string> = {}
  if (r.data.configEnc) {
    try {
      config = decryptCredentials<Record<string, string>>(r.data.configEnc, r.data.orgId)
    } catch (err) {
      console.error('[crm-integration] config decrypt failed', id, err)
      config = {}
    }
  }

  const integration = { id, ...r.data, config } as CrmIntegration
  return apiSuccess(toPublicView(integration))
})

// ---------------------------------------------------------------------------
// PUT / PATCH — admin+
// ---------------------------------------------------------------------------

async function handleIntegrationUpdate(
  req: NextRequest,
  ctx: CrmAuthContext,
  routeCtx: RouteCtx | undefined,
): Promise<Response> {
  const { id } = await routeCtx!.params
  const r = await loadIntegration(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  // Guard: reject no-op requests that supply no editable fields
  const hasEditableFields = (
    typeof body.name === 'string' ||
    Array.isArray(body.autoTags) ||
    Array.isArray(body.autoCampaignIds) ||
    typeof body.cadenceMinutes === 'number' ||
    body.status === 'paused' || body.status === 'active' ||
    (body.config !== undefined && body.config !== null)
  )
  if (!hasEditableFields) {
    return apiError('No editable fields supplied', 400)
  }

  // Decrypt existing config for merging
  let currentConfig: Record<string, string> = (r.data as CrmIntegration).config ?? {}
  if (r.data.configEnc) {
    try {
      currentConfig = decryptCredentials<Record<string, string>>(r.data.configEnc, r.data.orgId)
    } catch (err) {
      console.error('[crm-integration] config decrypt failed on PUT', id, err)
    }
  }

  // PR 5 pattern: use ctx.actor directly (no snapshotForWrite)
  const actorRef = ctx.actor

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editable: Record<string, any> = {
    updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
    updatedByRef: actorRef,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (typeof body.name === 'string') editable.name = body.name.trim()
  if (Array.isArray(body.autoTags)) editable.autoTags = body.autoTags
  if (Array.isArray(body.autoCampaignIds)) editable.autoCampaignIds = body.autoCampaignIds
  if (typeof body.cadenceMinutes === 'number') editable.cadenceMinutes = body.cadenceMinutes

  // Status transitions: only allow paused/active toggle from the user
  if (typeof body.status === 'string' && (body.status === 'paused' || body.status === 'active')) {
    editable.status = body.status
  }

  // Config patch — merge into existing, validate against provider schema, re-encrypt
  let mergedConfig: Record<string, string> | null = null
  if (body.config && typeof body.config === 'object') {
    const entry = findProvider(r.data.provider)
    if (!entry) return apiError('Provider not registered', 500)
    const newConfig = { ...currentConfig }
    for (const field of entry.configFields) {
      const v = body.config[field.key]
      if (typeof v === 'string' && v.trim()) newConfig[field.key] = v.trim()
    }
    mergedConfig = newConfig
    editable.configEnc = encryptCredentials(newConfig, r.data.orgId)
  }

  // Firestore rejects undefined values — strip them before write
  const sanitized = Object.fromEntries(Object.entries(editable).filter(([, v]) => v !== undefined))
  await r.ref.update(sanitized)

  const updated = await r.ref.get()
  const integration = {
    id,
    ...updated.data(),
    config: mergedConfig ?? currentConfig,
  } as CrmIntegration
  return apiSuccess(toPublicView(integration))
}

export const PUT = withCrmAuth<RouteCtx>('admin', handleIntegrationUpdate)
export const PATCH = withCrmAuth<RouteCtx>('admin', handleIntegrationUpdate)

// ---------------------------------------------------------------------------
// DELETE — admin+
// ---------------------------------------------------------------------------

export const DELETE = withCrmAuth<RouteCtx>('admin', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const r = await loadIntegration(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  // PR 5 pattern: use ctx.actor directly
  const actorRef = ctx.actor

  const deletePatch: Record<string, unknown> = {
    deleted: true,
    updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
    updatedByRef: actorRef,
    updatedAt: FieldValue.serverTimestamp(),
  }

  // Firestore rejects undefined values — strip them before write
  const sanitized = Object.fromEntries(
    Object.entries(deletePatch).filter(([, v]) => v !== undefined),
  )
  await r.ref.update(sanitized)

  return apiSuccess({ id })
})
