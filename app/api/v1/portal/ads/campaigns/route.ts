// app/api/v1/portal/ads/campaigns/route.ts
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess } from '@/lib/api/response'
import { listCampaigns } from '@/lib/ads/campaigns/store'
import type { OrgRole } from '@/lib/organizations/types'
import type { AdCampaign } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

export const GET = withPortalAuthAndRole(
  'viewer',
  async (req: NextRequest, uid: string, orgId: string, role: OrgRole) => {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as AdCampaign['status'] | null

    const campaigns = await listCampaigns({
      orgId,
      status: status ?? undefined,
    })

    return apiSuccess(campaigns)
  },
) as any
