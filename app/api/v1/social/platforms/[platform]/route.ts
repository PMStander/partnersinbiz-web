/**
 * GET /api/v1/social/platforms/:platform  — get constraints for a single platform
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getConstraints, isPlatformActive } from '@/lib/social/providers'
import type { SocialPlatformType } from '@/lib/social/providers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ platform: string }> }

export const GET = withAuth('client', withTenant(async (_req, _user, _orgId, context) => {
  const { platform } = await (context as Params).params

  try {
    const constraints = getConstraints(platform as SocialPlatformType)
    return apiSuccess({
      ...constraints,
      active: isPlatformActive(platform as SocialPlatformType),
    })
  } catch {
    return apiError(`Unknown platform: ${platform}`, 404)
  }
}))
