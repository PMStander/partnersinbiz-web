// lib/ab-testing/apply.ts
//
// Apply variant overrides to a base email definition. Pure function. The
// sender (cron worker / broadcast dispatcher) calls this just before queuing
// the actual Resend send.
//
// Overrides stack: if a variant declares both a "subject" and a "body"
// override, the body's subject takes precedence (a body override carries its
// own subject for paired creative).
import type { Variant } from './types'

export interface BaseEmail {
  subject: string
  bodyHtml: string
  bodyText: string
  fromName: string
  scheduledFor: Date | null
}

export function applyVariantOverrides(base: BaseEmail, variant: Variant | null): BaseEmail {
  if (!variant) return { ...base }

  let subject = base.subject
  let bodyHtml = base.bodyHtml
  let bodyText = base.bodyText
  let fromName = base.fromName
  let scheduledFor = base.scheduledFor ? new Date(base.scheduledFor.getTime()) : null

  // First pass: subject / fromName / sendTime — these are simple field swaps.
  for (const o of variant.overrides) {
    if (o.kind === 'subject') {
      subject = o.subject
    } else if (o.kind === 'fromName') {
      fromName = o.fromName
    } else if (o.kind === 'sendTime') {
      if (scheduledFor) {
        scheduledFor = new Date(scheduledFor.getTime() + o.offsetMinutes * 60_000)
      }
    }
  }

  // Second pass: body override wins for content + (optionally) subject.
  for (const o of variant.overrides) {
    if (o.kind === 'body') {
      bodyHtml = o.bodyHtml
      bodyText = o.bodyText
      if (typeof o.subject === 'string' && o.subject.length > 0) {
        subject = o.subject
      }
    }
  }

  return { subject, bodyHtml, bodyText, fromName, scheduledFor }
}
