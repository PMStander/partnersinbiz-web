// lib/sms/twilio.ts
//
// Thin wrapper around the official Twilio Node SDK. Centralises:
//   • client construction (and dry-run when env vars are missing)
//   • a single sendSms entry point that callers can rely on
//   • E.164 validation + normalisation (defaulting to South Africa)
//   • GSM-7 vs UCS-2 segment counting so the admin UI + server can warn
//     about long bodies and we can stamp `segmentsCount` on the sms doc
//
// The pattern mirrors lib/email/resend.ts: if TWILIO_AUTH_TOKEN is unset we
// log a warning and return a stub success with a `dryrun_*` SID so the rest
// of the pipeline (preferences gate, sms-doc writes, stat rollups) still flows
// in local/preview environments.
//
// Sending uses a Messaging Service when TWILIO_MESSAGING_SERVICE_SID is set
// (preferred — Twilio picks the right number / handles compliance) and falls
// back to a single `from` number otherwise.

import twilio from 'twilio'

// ── Public types ────────────────────────────────────────────────────────────

export interface SmsSendInput {
  to: string
  body: string
  from?: string
  mediaUrls?: string[]
  statusCallbackUrl?: string
}

export interface SmsSendResult {
  ok: boolean
  twilioSid: string
  error?: string
  errorCode?: string
  segmentsCount: number
}

// ── Client construction ─────────────────────────────────────────────────────

// Cached client — twilio() opens nothing until first call, but we still keep
// a single instance per process.
let _client: twilio.Twilio | null = null

export function getTwilioClient(): twilio.Twilio | null {
  if (_client) return _client
  const sid = (process.env.TWILIO_ACCOUNT_SID ?? '').trim()
  const token = (process.env.TWILIO_AUTH_TOKEN ?? '').trim()
  if (!sid || !token) return null
  _client = twilio(sid, token)
  return _client
}

// ── Sending ─────────────────────────────────────────────────────────────────

function defaultStatusCallback(): string | undefined {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? '').replace(
    /\/$/,
    '',
  )
  if (!base) return undefined
  return `${base}/api/v1/sms/status-webhook`
}

export async function sendSms(input: SmsSendInput): Promise<SmsSendResult> {
  const to = (input.to ?? '').trim()
  const body = input.body ?? ''
  const seg = countSmsSegments(body)

  if (!to || !isValidE164(to)) {
    return {
      ok: false,
      twilioSid: '',
      error: `invalid recipient phone: "${to}"`,
      errorCode: 'invalid_phone',
      segmentsCount: seg.segments,
    }
  }

  if (!body.trim()) {
    return {
      ok: false,
      twilioSid: '',
      error: 'empty SMS body',
      errorCode: 'empty_body',
      segmentsCount: 0,
    }
  }

  const client = getTwilioClient()
  if (!client) {
    // Dev / preview without Twilio creds — log and pretend success so the rest
    // of the pipeline (preferences, stats, sms docs, idempotency) still flows.
    // eslint-disable-next-line no-console
    console.warn(
      `[sms/twilio] TWILIO_AUTH_TOKEN not set — skipping actual send to ${to} (${seg.segments} seg)`,
    )
    return {
      ok: true,
      twilioSid: `dryrun_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      segmentsCount: seg.segments,
    }
  }

  const messagingServiceSid = (process.env.TWILIO_MESSAGING_SERVICE_SID ?? '').trim()
  const fallbackFrom =
    (input.from ?? '').trim() || (process.env.TWILIO_DEFAULT_FROM_NUMBER ?? '').trim()

  if (!messagingServiceSid && !fallbackFrom) {
    return {
      ok: false,
      twilioSid: '',
      error:
        'no sender configured — set TWILIO_MESSAGING_SERVICE_SID or TWILIO_DEFAULT_FROM_NUMBER',
      errorCode: 'no_sender',
      segmentsCount: seg.segments,
    }
  }

  const statusCallback = (input.statusCallbackUrl ?? '').trim() || defaultStatusCallback()

  type TwilioCreateParams = Parameters<typeof client.messages.create>[0]
  const params: TwilioCreateParams = { to, body } as TwilioCreateParams
  if (messagingServiceSid) {
    ;(params as { messagingServiceSid?: string }).messagingServiceSid = messagingServiceSid
  } else if (fallbackFrom) {
    ;(params as { from?: string }).from = fallbackFrom
  }
  if (input.mediaUrls && input.mediaUrls.length > 0) {
    ;(params as { mediaUrl?: string[] }).mediaUrl = input.mediaUrls
  }
  if (statusCallback) {
    ;(params as { statusCallback?: string }).statusCallback = statusCallback
  }

  try {
    const msg = await client.messages.create(params)
    const numSegmentsRaw = (msg as { numSegments?: string | number }).numSegments
    const numSegments = (() => {
      if (typeof numSegmentsRaw === 'number' && Number.isFinite(numSegmentsRaw)) return numSegmentsRaw
      if (typeof numSegmentsRaw === 'string') {
        const n = parseInt(numSegmentsRaw, 10)
        if (Number.isFinite(n) && n > 0) return n
      }
      return seg.segments
    })()
    return { ok: true, twilioSid: msg.sid, segmentsCount: numSegments }
  } catch (err) {
    const e = err as { message?: string; code?: string | number }
    return {
      ok: false,
      twilioSid: '',
      error: e?.message ?? 'twilio send failed',
      errorCode: e?.code !== undefined ? String(e.code) : 'twilio_error',
      segmentsCount: seg.segments,
    }
  }
}

// ── E.164 helpers ───────────────────────────────────────────────────────────

// Strict E.164: leading +, country code starting 1–9, then 6–14 digits.
const E164_REGEX = /^\+[1-9]\d{6,14}$/

export function isValidE164(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false
  return E164_REGEX.test(phone.trim())
}

// Country dial codes we accept as a "trusted normalisation" path. Conservative
// list — for anything else we require the caller to pass an explicit
// `defaultCountry`. Avoids guessing wrong country codes from ambiguous input.
const COUNTRY_DIAL_CODES: Record<string, string> = {
  ZA: '27',
  US: '1',
  CA: '1',
  GB: '44',
  AU: '61',
  NZ: '64',
  IE: '353',
  IN: '91',
  DE: '49',
  FR: '33',
  ES: '34',
  IT: '39',
  NL: '31',
  BE: '32',
  PT: '351',
  KE: '254',
  NG: '234',
  GH: '233',
  EG: '20',
  MA: '212',
}

/**
 * Normalise a phone string to E.164. Handles:
 *   • already-E.164 input (passes through after trim)
 *   • numbers with spaces, dashes, parentheses (stripped)
 *   • 00-prefixed international format (e.g. "0044…" → "+44…")
 *   • local format with leading 0 + defaultCountry (e.g. "082 555 1234" + ZA
 *     → "+27825551234")
 *   • bare digits matching a known country dial code prefix
 *
 * Returns null if it can't parse with reasonable confidence.
 */
export function normalizeToE164(phone: string, defaultCountry?: string): string | null {
  if (!phone || typeof phone !== 'string') return null
  const raw = phone.trim()
  if (!raw) return null

  // Already E.164 — quick win.
  if (E164_REGEX.test(raw)) return raw

  // Strip everything that isn't a digit or a leading '+'.
  const hadPlus = raw.startsWith('+')
  let digits = raw.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)

  // 00-prefix international = +.
  if (digits.startsWith('00')) {
    const candidate = '+' + digits.slice(2)
    return E164_REGEX.test(candidate) ? candidate : null
  }

  if (hadPlus) {
    const candidate = '+' + digits
    return E164_REGEX.test(candidate) ? candidate : null
  }

  // Local format — needs a defaultCountry to disambiguate.
  const country = (defaultCountry ?? 'ZA').toUpperCase()
  const dialCode = COUNTRY_DIAL_CODES[country]
  if (!dialCode) return null

  // Strip a single leading zero (local trunk prefix in most countries).
  if (digits.startsWith('0')) digits = digits.slice(1)

  // If digits already begin with the dial code, just prefix '+'.
  if (digits.startsWith(dialCode)) {
    const candidate = '+' + digits
    return E164_REGEX.test(candidate) ? candidate : null
  }

  const candidate = '+' + dialCode + digits
  return E164_REGEX.test(candidate) ? candidate : null
}

// ── Segment counting ────────────────────────────────────────────────────────

// GSM-7 charset (basic + extension) per 3GPP TS 23.038. Any character outside
// this set forces the message into UCS-2 encoding (70 chars / segment).
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(
    '',
  ),
)
const GSM7_EXTENSION = new Set(['\f', '^', '{', '}', '\\', '[', '~', ']', '|', '€'])

function isGsm7(body: string): boolean {
  for (const ch of body) {
    if (GSM7_BASIC.has(ch)) continue
    if (GSM7_EXTENSION.has(ch)) continue
    return false
  }
  return true
}

function gsm7Length(body: string): number {
  // Extension characters count as 2 GSM-7 "septets".
  let n = 0
  for (const ch of body) {
    n += GSM7_EXTENSION.has(ch) ? 2 : 1
  }
  return n
}

export function countSmsSegments(body: string): {
  encoding: 'gsm7' | 'ucs2'
  segments: number
  characters: number
} {
  const text = body ?? ''
  if (!text) return { encoding: 'gsm7', segments: 0, characters: 0 }

  if (isGsm7(text)) {
    const len = gsm7Length(text)
    if (len <= 160) return { encoding: 'gsm7', segments: 1, characters: len }
    // Multi-segment GSM-7: 153 septets per segment (UDH overhead).
    return { encoding: 'gsm7', segments: Math.ceil(len / 153), characters: len }
  }

  // UCS-2 path. Use the UTF-16 code unit count — surrogate pairs (e.g. some
  // emoji) take two code units and Twilio bills accordingly.
  const len = Array.from(text).reduce((acc, ch) => acc + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0)
  if (len <= 70) return { encoding: 'ucs2', segments: 1, characters: len }
  return { encoding: 'ucs2', segments: Math.ceil(len / 67), characters: len }
}
