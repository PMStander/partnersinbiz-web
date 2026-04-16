// lib/payments/paypal.ts
/**
 * Minimal PayPal REST v2 client.
 *
 * Env vars:
 *   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET  (required)
 *   PAYPAL_ENV         sandbox | live        (defaults to 'live')
 *   PAYPAL_WEBHOOK_ID  (required for webhook signature verification)
 *
 * We hit the REST API directly via `fetch` rather than pulling the
 * `@paypal/checkout-server-sdk` dependency — the endpoints we need are
 * trivial and the SDK is effectively unmaintained.
 */

interface CachedToken {
  token: string
  expiresAt: number
}

let tokenCache: CachedToken | null = null

function apiBase(): string {
  const env = process.env.PAYPAL_ENV ?? 'live'
  return env === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'
}

function requireCreds(): { clientId: string; secret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const secret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !secret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set')
  }
  return { clientId, secret }
}

/**
 * OAuth client_credentials flow. PayPal tokens last ~9 hours; we cache
 * in memory for 8h to stay comfortably inside the window.
 */
export async function getPayPalAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token

  const { clientId, secret } = requireCreds()
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64')
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayPal token request failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = {
    token: data.access_token,
    // cache for 8 h OR (expires_in - 60s), whichever is sooner
    expiresAt: Date.now() + Math.min(8 * 60 * 60 * 1000, (data.expires_in - 60) * 1000),
  }
  return data.access_token
}

export interface CreatedOrder {
  id: string
  approveUrl: string | null
}

export async function createPayPalOrder(
  amount: number,
  currency: string,
  referenceId: string,
  returnUrl: string,
  cancelUrl: string,
): Promise<CreatedOrder> {
  const token = await getPayPalAccessToken()
  const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: referenceId,
          amount: {
            currency_code: currency,
            value: amount.toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayPal create order failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as {
    id: string
    links?: Array<{ href: string; rel: string }>
  }
  const approveUrl = data.links?.find((l) => l.rel === 'approve')?.href ?? null
  return { id: data.id, approveUrl }
}

export interface CapturedOrder {
  id: string
  status: string
  captureId: string | null
}

export async function capturePayPalOrder(orderId: string): Promise<CapturedOrder> {
  const token = await getPayPalAccessToken()
  const res = await fetch(`${apiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PayPal capture failed: ${res.status} ${body}`)
  }

  const data = (await res.json()) as {
    id: string
    status: string
    purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }>
  }
  const captureId =
    data.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? null
  return { id: data.id, status: data.status, captureId }
}

/**
 * Calls PayPal's webhook signature verification endpoint.
 *
 * Requires `PAYPAL_WEBHOOK_ID` — the id of the webhook registered in the
 * PayPal dashboard. The `headers` param should be the raw inbound
 * transmission headers (`paypal-transmission-*`, `paypal-auth-algo`,
 * `paypal-cert-url`) and `body` the JSON-parsed event payload.
 *
 * Returns `true` only when PayPal responds with `verification_status =
 * SUCCESS`. Any missing env/header → `false` (we fail closed).
 */
export async function verifyPayPalWebhook(
  headers: Headers,
  body: unknown,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID
  if (!webhookId) return false

  const transmissionId = headers.get('paypal-transmission-id')
  const transmissionTime = headers.get('paypal-transmission-time')
  const transmissionSig = headers.get('paypal-transmission-sig')
  const certUrl = headers.get('paypal-cert-url')
  const authAlgo = headers.get('paypal-auth-algo')

  if (!transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
    return false
  }

  try {
    const token = await getPayPalAccessToken()
    const res = await fetch(`${apiBase()}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transmission_id: transmissionId,
        transmission_time: transmissionTime,
        cert_url: certUrl,
        auth_algo: authAlgo,
        transmission_sig: transmissionSig,
        webhook_id: webhookId,
        webhook_event: body,
      }),
    })

    if (!res.ok) return false
    const data = (await res.json()) as { verification_status?: string }
    return data.verification_status === 'SUCCESS'
  } catch {
    return false
  }
}
