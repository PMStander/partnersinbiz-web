// lib/integrations/revenuecat/index.ts
//
// RevenueCat integration adapter. Default-exports an `IntegrationAdapter` and
// self-registers with the central registry on first import.

import type { IntegrationAdapter } from '@/lib/integrations/types'
import { registerAdapter } from '@/lib/integrations/registry'
import { upsertConnection } from '@/lib/integrations/connections'
import { pullDaily as pullDailyImpl } from './pull-daily'
import { handleWebhook as handleWebhookImpl } from './webhook'

const adapter: IntegrationAdapter = {
  provider: 'revenuecat',
  authKind: 'api_key',
  display: {
    name: 'RevenueCat',
    description:
      'Pull MRR, ARR, active subscriptions, churn and subscription revenue ' +
      'from your RevenueCat project. Listens for subscription webhooks.',
    iconKey: 'revenuecat',
    docsUrl: 'https://www.revenuecat.com/docs/api-v1',
    consoleUrl: 'https://app.revenuecat.com/api-keys',
  },

  /**
   * RevenueCat is API-key auth. Payload shape:
   *   { apiKey: string, projectId?: string, appId?: string, webhookSecret?: string }
   * `apiKey` is encrypted via crypto.encryptCredentials. The remaining fields
   * are saved on `connection.meta` so the rest of the platform can read them
   * without decrypting credentials.
   */
  saveCredentials: async (input) => {
    const { propertyId, orgId, payload } = input
    const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
    if (!apiKey) {
      throw new Error('RevenueCat saveCredentials: payload.apiKey is required')
    }
    const projectId = typeof payload.projectId === 'string' ? payload.projectId : undefined
    const appId = typeof payload.appId === 'string' ? payload.appId : undefined
    const webhookSecret =
      typeof payload.webhookSecret === 'string' ? payload.webhookSecret : undefined

    return upsertConnection({
      propertyId,
      orgId,
      provider: 'revenuecat',
      authKind: 'api_key',
      credentials: { apiKey, projectId },
      meta: {
        ...(projectId ? { projectId } : {}),
        ...(appId ? { appId } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      },
      status: 'connected',
      createdBy: 'admin',
      createdByType: 'user',
    })
  },

  pullDaily: (input) => pullDailyImpl(input),

  handleWebhook: (input) => handleWebhookImpl(input),
}

registerAdapter(adapter)

export default adapter
