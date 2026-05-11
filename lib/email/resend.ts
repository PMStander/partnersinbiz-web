// lib/email/resend.ts
import { Resend } from 'resend'

// FROM_ADDRESS is reserved for SYSTEM emails (ops notifications, approvals,
// invoice mails sent on behalf of PIB itself). Campaign / sequence sends
// must go through `sendCampaignEmail` so they pick the right per-org sender.
export const FROM_ADDRESS = 'peet@partnersinbiz.online'

let client: Resend | null = null

/** Returns a singleton Resend client. Lazy-initialised so it is safe at build time. */
export function getResendClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY)
  }
  return client
}

export interface CampaignSendInput {
  from: string                  // pre-formatted; resolve via lib/email/resolveFrom
  to: string
  cc?: string[]
  replyTo?: string
  subject: string
  html: string
  text: string
  /**
   * Extra SMTP headers. Merged with any auto-added List-Unsubscribe headers
   * (see `listUnsubscribeUrl`). Caller-supplied keys win on conflict.
   */
  headers?: Record<string, string>
  /**
   * If set, the send adds:
   *   List-Unsubscribe:        <{url}>
   *   List-Unsubscribe-Post:   List-Unsubscribe=One-Click
   * which is required by Gmail/Yahoo bulk-sender rules (RFC 8058).
   */
  listUnsubscribeUrl?: string
}

export interface CampaignSendResult {
  ok: boolean
  resendId: string              // empty when ok=false
  error?: string
}

/**
 * Sends a campaign / sequence email through Resend using a per-call `from`.
 * Caller is responsible for resolving the sender (see lib/email/resolveFrom)
 * and for interpolating any template variables before passing html/text in.
 */
export async function sendCampaignEmail(input: CampaignSendInput): Promise<CampaignSendResult> {
  const resend = getResendClient()

  // Build the final header set. Auto-headers go in first so a caller can
  // intentionally override them (e.g. a transactional path that wants its
  // own List-Unsubscribe value).
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

  const { data, error } = await resend.emails.send({
    from: input.from,
    to: input.to,
    cc: input.cc?.length ? input.cc : undefined,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    text: input.text,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
  })
  if (error || !data?.id) {
    return { ok: false, resendId: '', error: error?.message ?? 'Resend send failed' }
  }
  return { ok: true, resendId: data.id }
}

/**
 * Wraps plain-text body lines in simple HTML paragraphs.
 * Used when bodyHtml is not explicitly provided by the caller.
 */
export function plainTextToHtml(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => `<p style="margin:0 0 8px">${l}</p>`)
    .join('')
  return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">${lines}</div>`
}

/**
 * Strips HTML tags to produce a plain-text fallback from bodyHtml.
 */
export function htmlToPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}
