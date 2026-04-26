// lib/integrations/ga4/index.ts
//
// Default IntegrationAdapter export for Google Analytics 4. Glues the OAuth,
// pull-daily, and revoke pieces together into a single object the registry
// can publish.

import type { Connection, IntegrationAdapter } from '@/lib/integrations/types'
import { maybeDecryptCredentials } from '@/lib/integrations/crypto'
import { setConnectionStatus } from '@/lib/integrations/connections'
import {
  GA4_SCOPES,
  beginOAuth,
  completeOAuth,
  revokeToken,
} from './oauth'
import { pullDaily } from './pull-daily'
import type { Ga4Credentials } from './schema'
import { registerAdapter } from '@/lib/integrations/registry'

const adapter: IntegrationAdapter = {
  provider: 'ga4',
  authKind: 'oauth2',

  display: {
    name: 'Google Analytics 4',
    description:
      'Daily web/app analytics — sessions, users, pageviews, engagement, conversions.',
    iconKey: 'google-analytics',
    docsUrl:
      'https://developers.google.com/analytics/devguides/reporting/data/v1',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
  },

  beginOAuth: async (input) => beginOAuth(input),

  completeOAuth: async (input) => completeOAuth(input),

  pullDaily: async ({ connection, window }) => pullDaily({ connection, window }),

  revoke: async ({ connection }: { connection: Connection }) => {
    const creds = maybeDecryptCredentials<Ga4Credentials>(
      connection.credentialsEnc,
      connection.orgId,
    )
    if (creds?.refreshToken) {
      await revokeToken(creds.refreshToken)
    } else if (creds?.accessToken) {
      await revokeToken(creds.accessToken)
    }
    await setConnectionStatus({
      propertyId: connection.propertyId,
      provider: 'ga4',
      status: 'paused',
    })
  },
}

// Register at module-load. The registry imports this file once.
registerAdapter(adapter)

export { GA4_SCOPES }
export default adapter
