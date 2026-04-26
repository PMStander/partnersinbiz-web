// lib/integrations/google_ads/index.ts
//
// Public adapter for Google Ads. The orchestrator imports this module from
// the central registry (lib/integrations/registry.ts); we don't register
// ourselves here so unit tests can import the adapter without side effects.

import type { IntegrationAdapter } from '@/lib/integrations/types'
import { beginOAuth, completeOAuth, GOOGLE_ADS_SCOPES, revokeToken } from './oauth'
import { decryptCredentials } from '@/lib/integrations/crypto'
import { pullDaily } from './pull-daily'
import type { GoogleAdsCredentials } from './schema'

/**
 * Google Ads adapter. Exports the standard IntegrationAdapter contract:
 *   - OAuth2 begin/complete
 *   - pullDaily (daily customer-level cost / impressions / clicks / conversions)
 *   - revoke (best-effort OAuth token revocation on disconnect)
 *
 * Notes:
 *   - Every API call needs a `developer-token` header. The adapter reads it
 *     from `process.env.GOOGLE_ADS_DEVELOPER_TOKEN` at call time. Without
 *     it, pullDaily returns `metricsWritten: 0` and a note rather than
 *     throwing.
 *   - The customer id is read from `Property.config.revenue.googleAdsCustomerId`
 *     (XXX-XXX-XXXX, dashes stripped before the API call).
 *   - If the customer sits under a manager account, set
 *     `process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID`; the adapter sends it as the
 *     `login-customer-id` header on every request.
 */
const adapter: IntegrationAdapter = {
  provider: 'google_ads',
  authKind: 'oauth2',

  display: {
    name: 'Google Ads',
    description:
      'Daily cost, impressions, clicks, conversions, and ROAS from Google Ads (v17 REST API).',
    iconKey: 'google_ads',
    docsUrl: 'https://developers.google.com/google-ads/api/rest/overview',
    consoleUrl: 'https://ads.google.com',
  },

  beginOAuth,
  completeOAuth,

  pullDaily,

  /**
   * Revoke the connection's OAuth tokens with Google's revoke endpoint.
   * Best-effort — Google returns 200 on success and 400 if the token is
   * already invalid. We never throw.
   */
  async revoke({ connection }) {
    if (!connection.credentialsEnc) return
    try {
      const creds = decryptCredentials<GoogleAdsCredentials>(
        connection.credentialsEnc,
        connection.orgId,
      )
      // Revoke refresh token first (Google revokes both halves of the grant
      // when given the refresh token); fall back to access token.
      const target = creds.refreshToken || creds.accessToken
      if (target) await revokeToken(target)
    } catch {
      // Decrypt or fetch failure — nothing useful to do; leave silently.
    }
  },
}

export default adapter

export {
  beginOAuth,
  completeOAuth,
  pullDaily,
  GOOGLE_ADS_SCOPES,
}
