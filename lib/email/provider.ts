// lib/email/provider.ts
//
// Email provider abstraction. The platform sends every email through one of
// these adapters so the underlying transport (Resend, Amazon SES) can be
// swapped via the EMAIL_PROVIDER env var without touching call sites.
//
// Selection (in order):
//   1. EMAIL_PROVIDER=ses    → Amazon SES (raw, cheaper)
//   2. EMAIL_PROVIDER=resend → Resend (default, dev-friendly)
//   3. unset                 → Resend
//
// Adding a provider: implement EmailProvider, register it in `getEmailProvider`,
// and add a webhook route under app/api/v1/email/webhook/<id>.

export type EmailProviderId = 'resend' | 'ses'

export interface EmailProviderSendInput {
  from: string
  to: string | string[]
  cc?: string[]
  replyTo?: string
  subject: string
  html: string
  text: string
  /**
   * Extra SMTP headers. Adapters merge these with any auto-added List-
   * Unsubscribe headers; caller-supplied keys win on conflict.
   */
  headers?: Record<string, string>
  /**
   * When set the provider adds RFC 8058 one-click unsubscribe headers:
   *   List-Unsubscribe:        <{url}>
   *   List-Unsubscribe-Post:   List-Unsubscribe=One-Click
   */
  listUnsubscribeUrl?: string
}

export interface EmailProviderSendResult {
  ok: boolean
  /** Provider-issued message ID. Empty when ok=false. */
  messageId: string
  /** Echoes back the provider that handled the send so callers can persist it. */
  provider: EmailProviderId
  error?: string
}

export interface EmailProvider {
  id: EmailProviderId
  /** True when env vars needed for sending are present. */
  isConfigured(): boolean
  send(input: EmailProviderSendInput): Promise<EmailProviderSendResult>
}

function resolveProviderId(): EmailProviderId {
  const raw = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'ses') return 'ses'
  return 'resend'
}

let cached: EmailProvider | null = null
let cachedFor: EmailProviderId | null = null

/**
 * Returns the configured provider singleton. Re-reads EMAIL_PROVIDER if it has
 * changed between calls so tests can switch providers without a fresh import.
 */
export function getEmailProvider(): EmailProvider {
  const id = resolveProviderId()
  if (cached && cachedFor === id) return cached

  // Lazy require so the SES SDK isn't loaded in Resend-only deployments.
  if (id === 'ses') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSesProvider } = require('./providers/ses') as typeof import('./providers/ses')
    cached = createSesProvider()
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createResendProvider } = require('./providers/resend') as typeof import('./providers/resend')
    cached = createResendProvider()
  }
  cachedFor = id
  return cached
}

/** Test hook — drops the cached provider instance. */
export function resetEmailProviderForTests(): void {
  cached = null
  cachedFor = null
}

/**
 * Merges caller headers with auto-generated List-Unsubscribe / One-Click
 * headers. Caller headers win on conflict so a transactional path can set a
 * mailto:-only List-Unsubscribe.
 */
export function buildSendHeaders(input: EmailProviderSendInput): Record<string, string> {
  const headers: Record<string, string> = {}
  if (input.listUnsubscribeUrl) {
    headers['List-Unsubscribe'] = `<${input.listUnsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  if (input.headers) {
    for (const [k, v] of Object.entries(input.headers)) {
      headers[k] = v
    }
  }
  return headers
}
