// app/api/v1/ads/google/customers/route.ts
//
// Lists the Google Ads customer IDs the connected account can access
// (`customers:listAccessibleCustomers`). Called after OAuth completes so
// the UI can render a picker; Google requires the platform-wide
// `developer-token` on every call, which is why this lives in its own
// Google-namespaced route rather than reusing Meta's `[platform]/ad-accounts`
// path.
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import { decryptAccessToken } from '@/lib/ads/connections/store'
import { listAccessibleCustomers } from '@/lib/ads/providers/google/customers'
import { readDeveloperToken } from '@/lib/integrations/google_ads/oauth'
import type { AdConnection } from '@/lib/ads/types'

const COLLECTION = 'ad_connections'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (req: NextRequest) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const url = new URL(req.url)
    const connectionId = url.searchParams.get('connectionId')
    if (!connectionId) return apiError('Missing connectionId query param', 400)

    const snap = await adminDb.collection(COLLECTION).doc(connectionId).get()
    if (!snap.exists) return apiError('Connection not found', 404)
    const conn = snap.data() as AdConnection

    // Cross-tenant guard + platform guard. Same 404 (not 403) for both so
    // we don't leak whether a connectionId exists in another org.
    if (conn.orgId !== orgId || conn.platform !== 'google') {
      return apiError('Connection not found', 404)
    }

    const developerToken = readDeveloperToken()
    if (!developerToken) {
      return apiError('Missing GOOGLE_ADS_DEVELOPER_TOKEN env var', 500)
    }

    const accessToken = decryptAccessToken(conn)
    const customers = await listAccessibleCustomers({
      accessToken,
      developerToken,
    })

    return apiSuccess({ customers })
  },
)
