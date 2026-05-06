/**
 * POST /api/v1/crm/integrations/[id]/sync — manually trigger a sync run.
 *
 * Routes to the per-provider handler. Wraps the run with status tracking:
 *   1. status='syncing'
 *   2. invoke handler
 *   3. status='active' on success or 'error' on failure
 *   4. write lastSyncedAt + lastSyncStats + lastError
 *
 * Auth: client
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  EMPTY_SYNC_STATS,
  toPublicView,
  type CrmIntegration,
  type CrmIntegrationSyncStats,
} from '@/lib/crm/integrations/types'
import { syncMailchimp } from '@/lib/crm/integrations/handlers/mailchimp'
import type { ApiUser } from '@/lib/api/types'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params

  const snap = await adminDb.collection('crm_integrations').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Integration not found', 404)

  const integration = { id: snap.id, ...snap.data() } as CrmIntegration
  const scope = resolveOrgScope(user, integration.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  if (integration.status === 'syncing') {
    return apiError('A sync is already in progress for this integration', 422)
  }
  if (integration.status === 'paused' || integration.status === 'disabled') {
    return apiError(`Integration is ${integration.status} — resume it first`, 422)
  }

  await snap.ref.update({ status: 'syncing', updatedAt: FieldValue.serverTimestamp() })

  let stats: CrmIntegrationSyncStats = { ...EMPTY_SYNC_STATS }
  let error = ''
  let ok = false

  try {
    if (integration.provider === 'mailchimp') {
      const result = await syncMailchimp(integration)
      stats = result.stats
      ok = result.ok
      if (!result.ok) error = result.error
    } else {
      error = `Sync handler not implemented for provider: ${integration.provider}`
    }
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error'
  }

  await snap.ref.update({
    status: ok ? 'active' : 'error',
    lastSyncedAt: FieldValue.serverTimestamp(),
    lastSyncStats: stats,
    lastError: error,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const refreshed = await snap.ref.get()
  return apiSuccess({
    integration: toPublicView({ id: snap.id, ...refreshed.data() } as CrmIntegration),
    ok,
    stats,
    error,
  })
})
