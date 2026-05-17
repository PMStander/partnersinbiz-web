// app/api/v1/ads/conversion-actions/[id]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  getConversionAction,
  updateConversionAction,
  deleteConversionAction,
} from '@/lib/ads/conversion-actions/store'
import type { AdConversionAction } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const action = await getConversionAction(id)

    if (!action) return apiError('Conversion Action not found', 404)
    if (action.orgId !== orgId) return apiError('Conversion Action not found', 404)

    return apiSuccess({ action })
  },
)

export const PATCH = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const action = await getConversionAction(id)
    if (!action || action.orgId !== orgId) return apiError('Conversion Action not found', 404)

    let patch: Partial<Omit<AdConversionAction, 'id' | 'orgId' | 'platform' | 'createdAt'>>
    try { patch = await req.json() } catch { return apiError('Invalid JSON', 400) }

    try {
      const updated = await updateConversionAction(id, patch)
      return apiSuccess({ action: updated })
    } catch (err) {
      return apiError((err as Error).message ?? 'Update failed', 500)
    }
  },
)

export const DELETE = withAuth(
  'admin',
  async (req: NextRequest, _user: unknown, ctxParams: { params: Promise<{ id: string }> }) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const { id } = await ctxParams.params
    const action = await getConversionAction(id)
    if (!action || action.orgId !== orgId) return apiError('Conversion Action not found', 404)

    // Best-effort: remove from Google Ads if this is a Google action
    if (action.platform === 'google') {
      const resourceName = action.providerData?.google?.conversionActionResourceName
      if (resourceName) {
        try {
          const { getConnection, decryptAccessToken } = await import('@/lib/ads/connections/store')
          const conn = await getConnection({ orgId, platform: 'google' })
          if (conn) {
            const accessToken = decryptAccessToken(conn)  // SYNC — do NOT await
            const { readDeveloperToken } = await import('@/lib/integrations/google_ads/oauth')
            const developerToken = readDeveloperToken()
            if (developerToken) {
              const customerId = conn.defaultAdAccountId
              const connMeta = (conn.meta ?? {}) as Record<string, unknown>
              const googleMeta = (connMeta.google as Record<string, unknown> | undefined) ?? {}
              const loginCustomerId = typeof googleMeta.loginCustomerId === 'string'
                ? googleMeta.loginCustomerId
                : undefined
              if (customerId) {
                const { removeConversionAction } = await import('@/lib/ads/providers/google/conversions')
                await removeConversionAction({
                  customerId, accessToken, developerToken, loginCustomerId, resourceName,
                })
              }
            }
          }
        } catch (err) {
          // Best-effort: log but don't block the canonical delete
          console.error('[DELETE conversion-action] Google remove failed:', err)
        }
      }
    }

    await deleteConversionAction(id)
    return apiSuccess({ deleted: true })
  },
)
