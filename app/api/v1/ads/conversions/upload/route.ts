// app/api/v1/ads/conversions/upload/route.ts
// Cross-platform conversion upload entry point.
// Validates the request, then delegates to trackConversion which fans out to
// Meta CAPI or Google Enhanced Conversions based on the canonical ConversionAction doc.
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { trackConversion } from '@/lib/ads/conversions/track'

export const dynamic = 'force-dynamic'

export const POST = withAuth('admin', async (req: NextRequest) => {
  const orgId = req.headers.get('X-Org-Id')
  if (!orgId) return apiError('Missing X-Org-Id header', 400)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return apiError('Invalid JSON', 400) }

  if (typeof body.conversionActionId !== 'string') return apiError('conversionActionId required', 400)
  if (typeof body.eventId !== 'string') return apiError('eventId required', 400)
  const eventTimeIso = body.eventTime
  if (typeof eventTimeIso !== 'string') return apiError('eventTime (ISO string) required', 400)
  const eventTime = new Date(eventTimeIso)
  if (isNaN(eventTime.getTime())) return apiError('Invalid eventTime', 400)

  try {
    const result = await trackConversion({
      orgId,
      conversionActionId: body.conversionActionId,
      eventId: body.eventId,
      eventTime,
      value: typeof body.value === 'number' ? body.value : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user: (body.user ?? {}) as any,
      gclid: typeof body.gclid === 'string' ? body.gclid : undefined,
      customData: (body.customData ?? undefined) as Record<string, unknown> | undefined,
    })
    return apiSuccess({ result })
  } catch (err) {
    return apiError((err as Error).message ?? 'Upload failed', 500)
  }
})
