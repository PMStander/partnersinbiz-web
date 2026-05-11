// lib/email/inbound/classify.ts
//
// Classify an inbound email into a ReplyIntent. Heuristics only — these are
// good enough for routing in 99% of real cases (and the rare false positive
// flows through to 'reply', which is the safe default).

import type { ReplyIntent } from './types'

/**
 * Lowercased, trimmed header lookup. Header names from real MTAs can arrive
 * in any case ("X-Autoreply", "x-autoreply", "X-AUTOREPLY") so we normalise
 * keys at read time.
 */
function header(headers: Record<string, string>, name: string): string {
  if (!headers) return ''
  const target = name.toLowerCase()
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) {
      const v = headers[k]
      return typeof v === 'string' ? v.trim() : ''
    }
  }
  return ''
}

const AUTO_REPLY_SUBJECT_PREFIXES = [
  'auto:',
  'automatic reply:',
  'automatic reply',
  'vacation:',
  'out of office',
  'out-of-office',
  'autoreply:',
  'auto-reply:',
]

const UNSUB_PHRASES = [
  'unsubscribe',
  'remove me',
  'stop emailing',
  'take me off',
  'opt me out',
  'opt-out',
  'please remove',
]

function looksAutoReply(subject: string, headers: Record<string, string>): boolean {
  const subj = (subject ?? '').trim().toLowerCase()
  if (AUTO_REPLY_SUBJECT_PREFIXES.some((p) => subj.startsWith(p))) return true

  const autoSubmitted = header(headers, 'Auto-Submitted').toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true // RFC 3834: anything not "no" is auto

  if (header(headers, 'X-Autoreply')) return true
  if (header(headers, 'X-Autorespond')) return true

  const precedence = header(headers, 'Precedence').toLowerCase()
  if (precedence === 'auto_reply' || precedence === 'bulk' || precedence === 'auto-reply') return true

  return false
}

function looksBounce(fromEmail: string, headers: Record<string, string>): boolean {
  const from = (fromEmail ?? '').toLowerCase()
  if (
    from.includes('mailer-daemon') ||
    from.includes('postmaster') ||
    from.includes('bounce')
  ) {
    return true
  }
  if (header(headers, 'X-Failed-Recipients')) return true
  // Bounce DSNs often carry these headers.
  if (header(headers, 'X-Postmaster-Reject')) return true
  const contentType = header(headers, 'Content-Type').toLowerCase()
  if (contentType.includes('report-type=delivery-status')) return true
  return false
}

function looksUnsubscribe(bodyText: string): boolean {
  const body = (bodyText ?? '').toLowerCase().slice(0, 200)
  if (!body) return false
  return UNSUB_PHRASES.some((p) => body.includes(p))
}

export function classifyReply(input: {
  subject: string
  bodyText: string
  fromEmail?: string
  rawHeaders: Record<string, string>
}): ReplyIntent {
  const { subject, bodyText, fromEmail = '', rawHeaders } = input

  // Order matters: bounces first (they often look like auto-replies),
  // then auto-replies, then explicit unsubscribe wording, else 'reply'.
  if (looksBounce(fromEmail, rawHeaders)) return 'bounce-reply'
  if (looksAutoReply(subject, rawHeaders)) return 'auto-reply'
  if (looksUnsubscribe(bodyText)) return 'unsubscribe-reply'
  return 'reply'
}
