/**
 * POST /api/v1/crm/integrations/[id]/sync — manually trigger a sync run.
 *
 * Routes to the per-provider handler. Wraps the run with status tracking:
 *   1. status='syncing'
 *   2. invoke handler
 *   3. status='active' on success or 'error' on failure
 *   4. write lastSyncedAt + lastSyncStats + lastError
 *
 * Auth: admin+
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  EMPTY_SYNC_STATS,
  toPublicView,
  type CrmIntegration,
  type CrmIntegrationSyncStats,
} from '@/lib/crm/integrations/types'
import { syncMailchimp } from '@/lib/crm/integrations/handlers/mailchimp'
import { syncHubspot } from '@/lib/crm/integrations/handlers/hubspot'
import { syncGmail } from '@/lib/crm/integrations/handlers/gmail'

const COLLECTION = 'crm_integrations'

type RouteCtx = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// Tenant-scoped loader — returns 404 for missing OR cross-org documents
// (duplicated from [id]/route.ts — PR 5 decision: duplicate, don't share lib)
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

export const POST = withCrmAuth<RouteCtx>('admin', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params

  const r = await loadIntegration(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  const integration = { id, ...r.data } as CrmIntegration

  if (integration.status === 'syncing') {
    return apiError('A sync is already in progress for this integration', 422)
  }
  if (integration.status === 'paused' || integration.status === 'disabled') {
    return apiError(`Integration is ${integration.status} — resume it first`, 422)
  }

  // PR 5 pattern: use ctx.actor directly (no snapshotForWrite)
  const actorRef = ctx.actor
  const actorPatch = Object.fromEntries(
    Object.entries({
      updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
      updatedByRef: actorRef,
    }).filter(([, v]) => v !== undefined),
  )

  // Step 1: status → 'syncing'
  await r.ref.update({ status: 'syncing', ...actorPatch, updatedAt: FieldValue.serverTimestamp() })

  let stats: CrmIntegrationSyncStats = { ...EMPTY_SYNC_STATS }
  let error = ''
  let ok = false

  // Step 2: invoke handler (dispatch by provider — preserve existing pattern)
  try {
    if (integration.provider === 'mailchimp') {
      const result = await syncMailchimp(integration)
      stats = result.stats
      ok = result.ok
      if (!result.ok) error = result.error
    } else if (integration.provider === 'hubspot') {
      const result = await syncHubspot(integration)
      stats = result.stats
      ok = result.ok
      if (!result.ok) error = result.error
    } else if (integration.provider === 'gmail') {
      const result = await syncGmail(integration)
      stats = result.stats
      ok = result.ok
      if (!result.ok) error = result.error
    } else {
      error = `Sync handler not implemented for provider: ${integration.provider}`
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error'
  }

  // Step 3: status → 'active' or 'error' + lastSyncedAt + lastSyncStats + lastError
  await r.ref.update({
    status: ok ? 'active' : 'error',
    lastSyncedAt: FieldValue.serverTimestamp(),
    lastSyncStats: stats,
    lastError: error,
    ...actorPatch,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const refreshed = await r.ref.get()
  // config is never stored in Firestore (only configEnc). Pass empty map so
  // toPublicView / buildConfigPreview doesn't crash on undefined.
  return apiSuccess({
    integration: toPublicView({ id, ...refreshed.data(), config: {} } as CrmIntegration),
    ok,
    stats,
    error,
  })
})
