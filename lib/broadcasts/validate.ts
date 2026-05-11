// lib/broadcasts/validate.ts
//
// Pre-send validation shared by /schedule and /send-now. A broadcast must:
//   • have content (templateId OR subject + at least one body field)
//   • have an audience that resolves to >0 contacts
//   • have a from address that resolves (verified domain OR shared fallback)
//
// Returns an array of human-readable issues. Empty array means OK to send.

import { adminDb } from '@/lib/firebase/admin'
import { resolveFrom } from '@/lib/email/resolveFrom'
import { resolveBroadcastAudience } from './audience'
import type { Broadcast } from './types'

export interface ValidationResult {
  ok: boolean
  issues: string[]
  audienceSize: number
}

export async function validateBroadcastForSend(broadcast: Broadcast): Promise<ValidationResult> {
  const issues: string[] = []

  // 1. Content
  const c = broadcast.content
  if (!c) {
    issues.push('Content is missing.')
  } else if (c.templateId) {
    const tplSnap = await adminDb.collection('email_templates').doc(c.templateId).get()
    if (!tplSnap.exists || tplSnap.data()?.deleted) {
      issues.push(`Referenced template (${c.templateId}) does not exist.`)
    } else if ((tplSnap.data()?.orgId ?? '') !== broadcast.orgId) {
      issues.push('Referenced template belongs to a different organisation.')
    }
  } else {
    if (!c.subject?.trim()) issues.push('Subject is required.')
    if (!c.bodyHtml?.trim() && !c.bodyText?.trim()) {
      issues.push('Email body is required (bodyHtml or bodyText).')
    }
  }

  // 2. Audience
  const a = broadcast.audience
  if (!a || (!a.segmentId && (a.contactIds?.length ?? 0) === 0 && (a.tags?.length ?? 0) === 0)) {
    issues.push('Audience is empty — set a segment, contactIds, or tags.')
  }

  // 3. Sender — resolveFrom never throws; we just ensure it returns something.
  let orgName = ''
  try {
    const orgSnap = await adminDb.collection('organizations').doc(broadcast.orgId).get()
    if (orgSnap.exists) orgName = (orgSnap.data() as { name?: string })?.name ?? ''
  } catch {
    // Non-fatal — fallback will still produce a from.
  }
  const resolved = await resolveFrom({
    fromDomainId: broadcast.fromDomainId,
    fromName: broadcast.fromName,
    fromLocal: broadcast.fromLocal,
    orgName,
  })
  if (!resolved.from) {
    issues.push('Could not resolve a from address.')
  }

  // 4. Audience resolution count — only if we have any audience criteria.
  let audienceSize = 0
  if (a && (a.segmentId || a.contactIds?.length || a.tags?.length)) {
    const contacts = await resolveBroadcastAudience(broadcast.orgId, a)
    audienceSize = contacts.length
    if (audienceSize === 0) {
      issues.push('Audience resolves to 0 sendable contacts.')
    }
  }

  return { ok: issues.length === 0, issues, audienceSize }
}
