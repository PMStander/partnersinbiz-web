// lib/sms/segments.ts
//
// Pure (no-deps, browser-safe) SMS helpers. Extracted from lib/sms/twilio.ts
// so client components (e.g. BroadcastEditor, StepEditor) can import the
// segment counter + E.164 validators without pulling the Twilio Node SDK
// (which uses fs/net/tls and can't be bundled for the browser).
//
// Server code should keep importing `sendSms` / `getTwilioClient` from
// `lib/sms/twilio.ts` — that file re-exports these helpers for back-compat.

// ── E.164 validation ────────────────────────────────────────────────────────

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
