// app/api/v1/ads/google/merchant-center/route.ts
//
// GET /api/v1/ads/google/merchant-center
// Lists all Merchant Center bindings for the org. Strips token refs before
// returning — tokens are server-side only.
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listMerchantCenters } from '@/lib/ads/merchant-center/store'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (req: NextRequest) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    try {
      const bindings = await listMerchantCenters({ orgId })
      // Strip sensitive token refs before returning
      const safe = bindings.map(({ accessTokenRef: _a, refreshTokenRef: _r, ...rest }) => rest)
      return apiSuccess({ bindings: safe })
    } catch (err) {
      return apiError((err as Error).message || 'List failed', 500)
    }
  },
)
