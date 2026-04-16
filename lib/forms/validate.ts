// lib/forms/validate.ts
//
// Validates a raw submission against a form definition.
//
//  - For each field: if `required` and missing/empty → error
//  - Type checks: email regex, number is numeric, date parseable, select value
//    is in options, multiselect is array subset of options
//  - Validation block: minLength/maxLength for strings, min/max for numbers,
//    pattern regex
//  - Drops any keys in `data` that are not declared in `form.fields`
//  - Honeypot: if `_hp` is present AND non-empty, returns
//    `{ ok: true, normalized: {}, _honeypot: true }` so the caller can silently
//    accept without creating a real submission (bot-trap pattern)

import type { Form, FormField } from './types'

export type ValidateResult =
  | { ok: true; normalized: Record<string, unknown>; _honeypot?: boolean }
  | { ok: false; errors: string[] }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+\d][\d\s().-]{5,}$/

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

function toStringSafe(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function validateField(
  field: FormField,
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const label = field.label || field.id
  const empty = isEmpty(raw)

  if (empty) {
    if (field.required) return { ok: false, error: `${label} is required` }
    // Not required + empty → skip in normalized output.
    return { ok: true, value: undefined }
  }

  switch (field.type) {
    case 'email': {
      const s = toStringSafe(raw).trim()
      if (!EMAIL_RE.test(s)) return { ok: false, error: `${label} must be a valid email` }
      return applyStringValidation(field, s, label)
    }
    case 'phone': {
      const s = toStringSafe(raw).trim()
      if (!PHONE_RE.test(s)) return { ok: false, error: `${label} must be a valid phone number` }
      return applyStringValidation(field, s, label)
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` }
      const v = field.validation
      if (v?.min !== undefined && n < v.min) {
        return { ok: false, error: `${label} must be at least ${v.min}` }
      }
      if (v?.max !== undefined && n > v.max) {
        return { ok: false, error: `${label} must be at most ${v.max}` }
      }
      return { ok: true, value: n }
    }
    case 'date': {
      const s = toStringSafe(raw).trim()
      const parsed = Date.parse(s)
      if (Number.isNaN(parsed)) {
        return { ok: false, error: `${label} must be a valid date` }
      }
      return { ok: true, value: s }
    }
    case 'select':
    case 'radio': {
      const s = toStringSafe(raw).trim()
      const opts = field.options ?? []
      if (opts.length > 0 && !opts.includes(s)) {
        return { ok: false, error: `${label} must be one of: ${opts.join(', ')}` }
      }
      return { ok: true, value: s }
    }
    case 'multiselect': {
      if (!Array.isArray(raw)) {
        return { ok: false, error: `${label} must be an array` }
      }
      const opts = field.options ?? []
      const arr = raw.map((v) => toStringSafe(v).trim())
      if (opts.length > 0) {
        const bad = arr.find((v) => !opts.includes(v))
        if (bad !== undefined) {
          return { ok: false, error: `${label} contains invalid option "${bad}"` }
        }
      }
      return { ok: true, value: arr }
    }
    case 'checkbox': {
      const val =
        typeof raw === 'boolean'
          ? raw
          : typeof raw === 'string'
            ? ['true', '1', 'yes', 'on'].includes(raw.toLowerCase())
            : Boolean(raw)
      return { ok: true, value: val }
    }
    case 'file': {
      // Files are uploaded out-of-band; we accept any non-empty scalar (URL / id).
      return { ok: true, value: toStringSafe(raw) }
    }
    case 'hidden':
    case 'text':
    case 'textarea':
    default: {
      const s = toStringSafe(raw)
      return applyStringValidation(field, s, label)
    }
  }
}

function applyStringValidation(
  field: FormField,
  value: string,
  label: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const v = field.validation
  if (!v) return { ok: true, value }

  if (v.minLength !== undefined && value.length < v.minLength) {
    return { ok: false, error: `${label} must be at least ${v.minLength} characters` }
  }
  if (v.maxLength !== undefined && value.length > v.maxLength) {
    return { ok: false, error: `${label} must be at most ${v.maxLength} characters` }
  }
  if (v.pattern) {
    try {
      const re = new RegExp(v.pattern)
      if (!re.test(value)) {
        return { ok: false, error: `${label} format is invalid` }
      }
    } catch {
      // Bad regex on the form itself — ignore silently rather than block submissions.
    }
  }
  return { ok: true, value }
}

/**
 * Validate a raw submission payload against a form definition.
 *
 * Returns either a successful result with a `normalized` map (keyed by
 * fieldId, containing only declared fields), or a failure with an `errors`
 * array listing every problem found.
 *
 * Special case: if `data._hp` (the honeypot field) is present AND non-empty,
 * returns `{ ok: true, normalized: {}, _honeypot: true }` so callers can
 * silently accept the submission without persisting it.
 */
export function validateSubmission(
  form: Form,
  data: Record<string, unknown>,
): ValidateResult {
  // Honeypot: bots tend to fill every field. `_hp` is invisible to humans.
  const hp = data?._hp
  if (hp !== undefined && hp !== null && String(hp).trim() !== '') {
    return { ok: true, normalized: {}, _honeypot: true }
  }

  const errors: string[] = []
  const normalized: Record<string, unknown> = {}

  for (const field of form.fields) {
    const raw = data?.[field.id]
    const result = validateField(field, raw)
    if (!result.ok) {
      errors.push(result.error)
      continue
    }
    if (result.value !== undefined) {
      normalized[field.id] = result.value
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, normalized }
}
