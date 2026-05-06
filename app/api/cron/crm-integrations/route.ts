/**
 * GET /api/cron/crm-integrations — fire scheduled CRM-integration syncs.
 *
 * Distinct from /api/cron/integrations which dispatches analytics-data
 * adapters (AdSense / GA4 / etc). This endpoint runs the campaign-system
 * connectors that pull CONTACTS into the CRM (Mailchimp, etc).
 *
 * Suggested cadence: every 15 minutes (see vercel.json). For each integration
 * where status='active', cadenceMinutes > 0, and (lastSyncedAt is null OR
 * elapsed >= cadenceMinutes), runs the per-provider handler.
 *
 * Manual one-off syncs go through `POST /api/v1/crm/integrations/[id]/sync`.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  EMPTY_SYNC_STATS,
  type CrmIntegration,
  type CrmIntegrationSyncStats,
} from '@/lib/crm/integrations/types'
import { syncMailchimp } from '@/lib/crm/integrations/handlers/mailchimp'
import { syncHubspot } from '@/lib/crm/integrations/handlers/hubspot'
import { syncGmail } from '@/lib/crm/integrations/handlers/gmail'
import { decryptCredentials } from '@/lib/integrations/crypto'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)

  const now = Date.now()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await (adminDb.collection('crm_integrations') as any)
    .where('status', '==', 'active')
    .get()

  const due: CrmIntegration[] = []
  for (const doc of snap.docs) {
    const integration = { id: doc.id, ...doc.data() } as CrmIntegration
    if (integration.deleted) continue
    if (!integration.cadenceMinutes || integration.cadenceMinutes <= 0) continue
    const lastMs = integration.lastSyncedAt
      ? ((integration.lastSyncedAt as { _seconds?: number; seconds?: number })._seconds ?? (integration.lastSyncedAt as { _seconds?: number; seconds?: number }).seconds ?? 0) * 1000
      : 0
    const elapsedMin = lastMs ? (now - lastMs) / 60_000 : Infinity
    if (elapsedMin >= integration.cadenceMinutes) {
      due.push(integration)
    }
  }

  const results: Array<{ id: string; ok: boolean; stats: CrmIntegrationSyncStats; error: string }> = []
  for (const integration of due) {
    const ref = adminDb.collection('crm_integrations').doc(integration.id)
    await ref.update({ status: 'syncing', updatedAt: FieldValue.serverTimestamp() })

    // Decrypt configEnc before passing to handlers — handlers expect plain config
    let decryptedIntegration = integration
    if (integration.configEnc) {
      try {
        const config = decryptCredentials<Record<string, string>>(integration.configEnc, integration.orgId)
        decryptedIntegration = { ...integration, config }
      } catch (err) {
        console.error('[cron-crm] config decrypt failed', integration.id, err)
      }
    }

    let stats: CrmIntegrationSyncStats = { ...EMPTY_SYNC_STATS }
    let error = ''
    let ok = false

    try {
      if (decryptedIntegration.provider === 'mailchimp') {
        const r = await syncMailchimp(decryptedIntegration)
        stats = r.stats
        ok = r.ok
        if (!r.ok) error = r.error
      } else if (decryptedIntegration.provider === 'hubspot') {
        const r = await syncHubspot(decryptedIntegration)
        stats = r.stats
        ok = r.ok
        if (!r.ok) error = r.error
      } else if (decryptedIntegration.provider === 'gmail') {
        const r = await syncGmail(decryptedIntegration)
        stats = r.stats
        ok = r.ok
        if (!r.ok) error = r.error
      } else {
        error = `No handler for provider: ${decryptedIntegration.provider}`
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error'
    }

    await ref.update({
      status: ok ? 'active' : 'error',
      lastSyncedAt: FieldValue.serverTimestamp(),
      lastSyncStats: stats,
      lastError: error,
      updatedAt: FieldValue.serverTimestamp(),
    })

    results.push({ id: integration.id, ok, stats, error })
  }

  return apiSuccess({ processed: results.length, results })
}
