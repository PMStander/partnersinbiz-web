// lib/integrations/play_console/index.ts
//
// Registers the Google Play Console integration adapter and default-exports
// it. Imported once by lib/integrations/registry.ts at module load.

import { registerAdapter } from '@/lib/integrations/registry'
import {
  upsertConnection,
  getConnection,
} from '@/lib/integrations/connections'
import type {
  Connection,
  IntegrationAdapter,
} from '@/lib/integrations/types'
import { parseServiceAccountJson } from './auth'
import { pullDaily } from './pull-daily'
import { handleWebhook, type HandleWebhookInput } from './webhook'
import {
  PLAY_REPORTING_SCOPE,
  type PlayConnectionMeta,
  type PlayCredentials,
} from './schema'

const adapter: IntegrationAdapter = {
  provider: 'play_console',
  authKind: 'service_account',
  display: {
    name: 'Google Play Console',
    description:
      'Daily installs, uninstalls, IAP/subscription revenue, and ratings via the Play Developer Reporting API. Real-time subscription/IAP events via RTDN Pub/Sub.',
    iconKey: 'play_console',
    docsUrl: 'https://developers.google.com/play/developer/reporting',
    consoleUrl: 'https://play.google.com/console',
  },

  /**
   * Save a service-account JSON. The user gets a service-account JSON from
   * Google Cloud, grants it View Financial Data + View App Statistics roles
   * in the Play Console, and pastes the JSON into our admin UI.
   */
  saveCredentials: async ({ propertyId, orgId, payload }) => {
    const json = (payload?.serviceAccountJson ?? '') as string
    if (!json || typeof json !== 'string') {
      throw new Error(
        "saveCredentials requires payload.serviceAccountJson (string of the service-account JSON).",
      )
    }
    const key = parseServiceAccountJson(json)
    const credentials: PlayCredentials = {
      serviceAccountJson: json,
      key,
    }
    const meta: PlayConnectionMeta = {
      clientEmail: key.client_email,
      projectId: key.project_id,
      packageName:
        typeof payload?.packageName === 'string'
          ? (payload.packageName as string)
          : undefined,
      pubsubWebhookUrl:
        typeof payload?.pubsubWebhookUrl === 'string'
          ? (payload.pubsubWebhookUrl as string)
          : `/api/integrations/play_console/webhook/${propertyId}`,
    }

    return upsertConnection({
      propertyId,
      orgId,
      provider: 'play_console',
      authKind: 'service_account',
      credentials: credentials as unknown as Record<string, unknown>,
      meta: meta as Record<string, unknown>,
      scope: [PLAY_REPORTING_SCOPE],
      status: 'connected',
      createdBy:
        typeof payload?.createdBy === 'string' ? (payload.createdBy as string) : 'system',
      createdByType:
        (payload?.createdByType as Connection['createdByType']) ?? 'system',
    })
  },

  pullDaily: ({ connection, window }) => pullDaily({ connection, window }),

  /**
   * RTDN handler. The route hands `propertyId` via the headers map (set by
   * the Next.js route from its dynamic param) since the IntegrationAdapter
   * contract does not include path params. We accept either:
   *   - `headers['x-pib-property-id']` — set by our route handler
   *   - `headers['x-property-id']` — alias
   */
  handleWebhook: async ({ rawBody, headers }) => {
    const propertyId =
      headers['x-pib-property-id'] ??
      headers['x-property-id'] ??
      undefined
    const input: HandleWebhookInput = { rawBody, propertyId }
    const result = await handleWebhook(input)
    return {
      status: result.status,
      metricsWritten: result.metricsWritten,
      notes: result.notes,
    }
  },

  revoke: async ({ connection }) => {
    // Mark the connection as paused; the user revokes the SA in GCP if they
    // want a hard cut-off. We don't delete credentials so they can re-connect.
    const existing = await getConnection({
      propertyId: connection.propertyId,
      provider: 'play_console',
    })
    if (!existing) return
    await upsertConnection({
      propertyId: existing.propertyId,
      orgId: existing.orgId,
      provider: 'play_console',
      authKind: 'service_account',
      credentials: null,
      meta: existing.meta,
      scope: existing.scope,
      status: 'paused',
      createdBy: existing.createdBy,
      createdByType: existing.createdByType,
    })
  },
}

registerAdapter(adapter)

export default adapter
