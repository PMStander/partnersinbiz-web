// lib/integrations/adsense/index.ts
//
// Adapter entry point for Google AdSense. The registry imports this file
// once at startup; importing it has the side-effect of calling
// `registerAdapter()` so dispatch can find this adapter by provider name.

import type { IntegrationAdapter } from '@/lib/integrations/types'
import { registerAdapter } from '@/lib/integrations/registry'
import { beginOAuth, completeOAuth } from './oauth'
import { pullDaily } from './pull-daily'

const adapter: IntegrationAdapter = {
  provider: 'adsense',
  authKind: 'oauth2',

  display: {
    name: 'Google AdSense',
    description:
      'Pulls daily ad revenue, impressions, clicks, CTR, RPM, and ad requests from your AdSense account.',
    iconKey: 'adsense',
    docsUrl:
      'https://developers.google.com/adsense/management/reference/rest',
    consoleUrl: 'https://www.google.com/adsense/',
  },

  async beginOAuth(input) {
    return beginOAuth(input)
  },

  async completeOAuth(input) {
    return completeOAuth(input)
  },

  async pullDaily(input) {
    return pullDaily(input)
  },
}

registerAdapter(adapter)

export default adapter
