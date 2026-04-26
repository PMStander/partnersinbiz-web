// /api/integrations/revenuecat/webhook/[propertyId]
//
// PUBLIC endpoint that RevenueCat calls. Path-scoped by propertyId so each
// property points its RevenueCat dashboard at a unique URL — the propertyId
// in the path tells us which connection to load (and thus which webhook
// secret to verify against).
//
// We always return 200 to RevenueCat for processed (or intentionally ignored)
// events so it doesn't retry. Verification failures still return non-200 so
// admins can spot misconfigurations.

import { NextRequest, NextResponse } from 'next/server'
import revenueCatAdapter from '@/lib/integrations/revenuecat'
import { PROPERTY_ID_HEADER } from '@/lib/integrations/revenuecat/webhook'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ propertyId: string }> },
): Promise<NextResponse> {
  const { propertyId } = await ctx.params
  if (!propertyId) {
    return NextResponse.json(
      { ok: false, error: 'Missing propertyId in URL.' },
      { status: 400 },
    )
  }

  // Read raw body verbatim — we need it for HMAC verification.
  const rawBody = await req.text()

  // Collect headers as a plain string→string map and inject the propertyId
  // so the adapter (which conforms to the IntegrationAdapter contract and
  // only sees `headers`) can resolve the connection.
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  headers[PROPERTY_ID_HEADER] = propertyId

  if (!revenueCatAdapter.handleWebhook) {
    return NextResponse.json(
      { ok: false, error: 'Adapter does not implement handleWebhook.' },
      { status: 500 },
    )
  }

  try {
    const result = await revenueCatAdapter.handleWebhook({ rawBody, headers })
    return NextResponse.json(
      {
        ok: result.status >= 200 && result.status < 300,
        metricsWritten: result.metricsWritten,
        notes: result.notes ?? [],
      },
      { status: result.status },
    )
  } catch (err) {
    console.error('[revenuecat webhook] handler error:', err)
    return NextResponse.json(
      { ok: false, error: 'internal_error' },
      { status: 500 },
    )
  }
}
