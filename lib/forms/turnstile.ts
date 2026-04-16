/**
 * Cloudflare Turnstile verification for public form submissions.
 *
 * Turnstile is free, privacy-first, no cookies, no pixels. It's an
 * invisible or lightweight challenge — much better UX than reCAPTCHA.
 *
 * Setup:
 *   1. Register a site at https://dash.cloudflare.com/?to=/:account/turnstile
 *   2. Save the site key on the form (`turnstileSiteKey` field)
 *   3. Set TURNSTILE_SECRET_KEY env var (server-side)
 *   4. Embed the widget on the public form page:
 *        <div class="cf-turnstile" data-sitekey="<siteKey>"></div>
 *        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
 *      The widget injects a hidden input `cf-turnstile-response` into the form.
 *   5. Include that field when POSTing to /api/v1/forms/[slug]/submit.
 */

export interface TurnstileVerifyResult {
  success: boolean
  challengeTs?: string
  hostname?: string
  errorCodes?: string[]
  action?: string
  cdata?: string
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verify a Turnstile token against Cloudflare's siteverify API.
 *
 * - Returns `{ success: false }` if the server is not configured
 *   (`TURNSTILE_SECRET_KEY` missing) — callers should treat this the
 *   same as an invalid token and surface a config error.
 * - Returns `{ success: false }` on network errors (fail-closed for
 *   a security-sensitive check).
 */
export async function verifyTurnstileToken(
  token: string,
  ip?: string,
): Promise<TurnstileVerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    return { success: false, errorCodes: ['missing-secret'] }
  }
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] }
  }

  const body = new URLSearchParams()
  body.set('secret', secret)
  body.set('response', token)
  if (ip) body.set('remoteip', ip)

  try {
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { success: false, errorCodes: [`http-${res.status}`] }
    const data = (await res.json()) as {
      success: boolean
      'challenge_ts'?: string
      hostname?: string
      'error-codes'?: string[]
      action?: string
      cdata?: string
    }
    return {
      success: Boolean(data.success),
      challengeTs: data['challenge_ts'],
      hostname: data.hostname,
      errorCodes: data['error-codes'],
      action: data.action,
      cdata: data.cdata,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, errorCodes: [`fetch-error:${message}`] }
  }
}
