/**
 * GET /api/v1/social/platforms  — list all platforms with constraints
 */
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess } from '@/lib/api/response'
import { getAllConstraints, isPlatformActive } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', withTenant(async () => {
  const allConstraints = getAllConstraints()

  const platforms = Object.values(allConstraints).map((c) => ({
    ...c,
    active: isPlatformActive(c.platform),
  }))

  return apiSuccess(platforms)
}))
