process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csec'
process.env.GSC_REDIRECT_URI = 'https://x/api/integrations/gsc/callback'

import { gscAuthUrl } from '@/lib/seo/integrations/gsc/auth'

describe('gsc/auth', () => {
  it('builds auth URL with webmasters.readonly scope', () => {
    const url = gscAuthUrl('state-123')
    expect(url).toContain('client_id=cid')
    expect(url).toContain('redirect_uri=')
    expect(url).toContain('webmasters.readonly')
    expect(url).toContain('state=state-123')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
  })
})
