// app/api/v1/ads/connections/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { listConnections } from '@/lib/ads/connections/store'
import type { AdConnection } from '@/lib/ads/types'

function publicShape(c: AdConnection) {
  const { accessTokenEnc, refreshTokenEnc, ...rest } = c
  return rest
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)
  const conns = await listConnections({ orgId })
  return apiSuccess(conns.map(publicShape))
})
