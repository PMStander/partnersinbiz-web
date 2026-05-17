// app/api/v1/ads/pixel-configs/[id]/test-event/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getPixelConfig } from '@/lib/ads/pixel-configs/store'
import { sendTestEvent } from '@/lib/ads/capi/test'

export const POST = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params

    const config = await getPixelConfig(id)
    if (!config || config.orgId !== orgId) return apiError('Pixel config not found', 404)

    const body = (await req.json()) as { testEventCode?: string }
    if (!body.testEventCode) return apiError('Missing required field: testEventCode', 400)

    const result = await sendTestEvent({ pixelConfigId: id, testEventCode: body.testEventCode })
    return apiSuccess(result)
  },
)
