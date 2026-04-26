// lib/integrations/admob/index.ts
//
// AdMob adapter entry point. Registers itself with the central registry on
// import (the registry imports this module from registry.ts).

import type { IntegrationAdapter } from '@/lib/integrations/types'
import { registerAdapter } from '@/lib/integrations/registry'
import { beginOAuth, completeOAuth, ADMOB_SCOPE } from './oauth'
import { pullDaily } from './pull-daily'

const adapter: IntegrationAdapter = {
  provider: 'admob',
  authKind: 'oauth2',
  display: {
    name: 'Google AdMob',
    description:
      'Pull daily ad earnings, impressions, clicks, eCPM and match rate from your AdMob publisher account.',
    iconKey: 'admob',
    docsUrl: 'https://developers.google.com/admob/api/v1/getting-started',
    consoleUrl: 'https://apps.admob.com',
  },
  beginOAuth,
  completeOAuth,
  pullDaily,
}

// Self-register on import so the central registry only needs to `import`
// this file once. Re-registration (e.g. hot reload in dev) is a no-op.
registerAdapter(adapter)

export { ADMOB_SCOPE }
export default adapter
