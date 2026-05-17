// app/api/v1/ads/conversion-actions/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  createConversionAction as createCanonical,
  listConversionActions,
} from '@/lib/ads/conversion-actions/store'
import type { AdConversionAction, AdConversionCategory } from '@/lib/ads/types'

export const dynamic = 'force-dynamic'

const VALID_CATEGORIES: AdConversionCategory[] = [
  'PAGE_VIEW', 'PURCHASE', 'SIGNUP', 'LEAD', 'DOWNLOAD',
  'ADD_TO_CART', 'BEGIN_CHECKOUT', 'SUBSCRIBE_PAID',
  'PHONE_CALL_LEAD', 'IMPORTED_LEAD', 'SUBMIT_LEAD_FORM',
  'BOOK_APPOINTMENT', 'REQUEST_QUOTE', 'GET_DIRECTIONS',
  'OUTBOUND_CLICK', 'CONTACT', 'ENGAGEMENT',
  'STORE_VISIT', 'STORE_SALE',
  'QUALIFIED_LEAD', 'CONVERTED_LEAD', 'OTHER',
]

export const GET = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  const url = new URL(req.url)
  const platform = url.searchParams.get('platform')
  const category = url.searchParams.get('category')

  try {
    const actions = await listConversionActions({
      orgId,
      platform: (platform === 'meta' || platform === 'google') ? platform : undefined,
      category: category ?? undefined,
    })
    return apiSuccess({ actions })
  } catch (err) {
    return apiError((err as Error).message ?? 'List failed', 500)
  }
})

export const POST = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

  const platform = body.platform
  if (platform !== 'meta' && platform !== 'google') return apiError('platform must be meta or google', 400)
  const name = body.name
  if (typeof name !== 'string' || !name.trim()) return apiError('name is required', 400)
  const category = body.category
  if (!VALID_CATEGORIES.includes(category as AdConversionCategory)) return apiError('Invalid category', 400)
  const countingType = body.countingType
  if (countingType !== 'ONE_PER_CLICK' && countingType !== 'MANY_PER_CLICK') {
    return apiError('countingType must be ONE_PER_CLICK or MANY_PER_CLICK', 400)
  }
  const valueSettings = (body.valueSettings ?? {}) as AdConversionAction['valueSettings']

  let providerData: AdConversionAction['providerData']

  if (platform === 'google') {
    // Look up Google connection + create Conversion Action via API
    const { getConnection, decryptAccessToken } = await import('@/lib/ads/connections/store')
    const conn = await getConnection({ orgId, platform: 'google' })
    if (!conn) return apiError('No Google Ads connection for org', 400)
    const accessToken = decryptAccessToken(conn)  // SYNC — do NOT await
    const { readDeveloperToken } = await import('@/lib/integrations/google_ads/oauth')
    const developerToken = readDeveloperToken()
    if (!developerToken) return apiError('GOOGLE_ADS_DEVELOPER_TOKEN not configured', 500)
    const customerId = (conn as { defaultAdAccountId?: string }).defaultAdAccountId
    if (!customerId) return apiError('No defaultAdAccountId on Google connection', 400)
    const connMeta = (conn.meta ?? {}) as Record<string, unknown>
    const googleMeta = (connMeta.google as Record<string, unknown> | undefined) ?? {}
    const loginCustomerId = typeof googleMeta.loginCustomerId === 'string'
      ? googleMeta.loginCustomerId
      : undefined

    try {
      const { createConversionAction: createOnGoogle } = await import('@/lib/ads/providers/google/conversions')
      // Build a partial canonical for the helper (id/createdAt/updatedAt not needed for create)
      const partial: AdConversionAction = {
        id: 'pending',
        orgId,
        platform: 'google',
        name: name.trim(),
        category: category as AdConversionCategory,
        valueSettings,
        countingType: countingType as 'ONE_PER_CLICK' | 'MANY_PER_CLICK',
        attributionModel: body.attributionModel as AdConversionAction['attributionModel'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createdAt: { seconds: 0, nanoseconds: 0 } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updatedAt: { seconds: 0, nanoseconds: 0 } as any,
      }
      const result = await createOnGoogle({
        customerId, accessToken, developerToken, loginCustomerId,
        canonical: partial,
      })
      providerData = { google: { conversionActionResourceName: result.resourceName } }
    } catch (err) {
      return apiError(`Google API: ${(err as Error).message}`, 502)
    }
  } else {
    // Meta — accept inline pixelId + customEventType from body
    const pixelId = typeof body.pixelId === 'string' ? body.pixelId : undefined
    const customEventType = typeof body.customEventType === 'string' ? body.customEventType : undefined
    if (pixelId || customEventType) {
      providerData = { meta: { pixelId, customEventType } }
    }
  }

  try {
    const created = await createCanonical({
      orgId,
      platform: platform as 'meta' | 'google',
      name: name.trim(),
      category: category as AdConversionCategory,
      valueSettings,
      countingType: countingType as 'ONE_PER_CLICK' | 'MANY_PER_CLICK',
      attributionModel: body.attributionModel as AdConversionAction['attributionModel'],
      providerData,
    })
    return apiSuccess({ action: created }, 201)
  } catch (err) {
    return apiError((err as Error).message ?? 'Create failed', 500)
  }
})
