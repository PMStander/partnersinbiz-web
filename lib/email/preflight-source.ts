// lib/email/preflight-source.ts
//
// Materialises the inputs that `runPreflight` expects from either a
// broadcast or a sequence step. Handles:
//   - resolving templateId → rendered HTML + EmailDocument
//   - resolving the from-name / from-address through resolveFrom
//   - detecting whether the send-time unsubscribe / preferences URLs will
//     be substituted (they are — always — for broadcasts and sequences)

import { adminDb } from '@/lib/firebase/admin'
import { resolveFrom } from '@/lib/email/resolveFrom'
import { renderEmail } from '@/lib/email-builder/render'
import type { EmailDocument } from '@/lib/email-builder/types'
import type { Broadcast } from '@/lib/broadcasts/types'
import type { SequenceStep } from '@/lib/sequences/types'
import type { PreflightInput } from './preflight'

interface LoadOpts {
  orgId: string
  fromDomainId?: string
  fromName?: string
  fromLocal?: string
  templateId?: string
  inlineSubject: string
  inlinePreheader?: string
  inlineHtml: string
  inlineText: string
}

/**
 * Resolve content + sender into a PreflightInput. Renders the template if a
 * templateId is set; falls back to the inline subject/body otherwise.
 *
 * Template variables are NOT interpolated here — the renderer still substitutes
 * `{{merge}}` tokens but we deliberately leave the standard ones (firstName,
 * unsubscribeUrl, preferencesUrl) intact so preflight catches missing-merge-
 * field issues without surfacing false-positives for the ones the send pipeline
 * always injects.
 */
async function loadPreflight(opts: LoadOpts): Promise<PreflightInput> {
  // Org name for resolveFrom + footer.
  let orgName = ''
  try {
    const orgSnap = await adminDb.collection('organizations').doc(opts.orgId).get()
    if (orgSnap.exists) orgName = (orgSnap.data() as { name?: string })?.name ?? ''
  } catch {
    // Non-fatal — preflight runs against whatever we can resolve.
  }

  const resolved = await resolveFrom({
    fromDomainId: opts.fromDomainId,
    fromName: opts.fromName,
    fromLocal: opts.fromLocal,
    orgName,
  })

  // If a template is referenced, render it now so preflight checks the real
  // HTML that recipients would see.
  let document: EmailDocument | null = null
  let subject = opts.inlineSubject
  let preheader = opts.inlinePreheader ?? ''
  let bodyHtml = opts.inlineHtml
  let bodyText = opts.inlineText

  if (opts.templateId) {
    const tplSnap = await adminDb.collection('email_templates').doc(opts.templateId).get()
    if (tplSnap.exists) {
      const data = tplSnap.data() ?? {}
      const doc = (data.document ?? data.doc ?? null) as EmailDocument | null
      if (doc && typeof doc === 'object') {
        document = doc
        // Pass the send-time merge fields the pipeline always injects so the
        // renderer doesn't leave unresolved placeholders that confuse the
        // broken-link checker. Concrete values aren't important — only that
        // they look like valid placeholders.
        const placeholderVars = {
          orgName,
          firstName: 'Recipient',
          lastName: '',
          fullName: 'Recipient',
          email: 'recipient@example.com',
          company: orgName,
          unsubscribeUrl: 'https://partnersinbiz.online/unsubscribe?preflight=1',
          preferencesUrl: 'https://partnersinbiz.online/preferences?preflight=1',
        }
        const rendered = renderEmail(doc, placeholderVars)
        subject = doc.subject || subject
        preheader = doc.preheader || preheader
        bodyHtml = rendered.html
        bodyText = rendered.text
      }
    }
  }

  // resolved.from looks like `Display Name <addr@domain>` or just `addr@domain`.
  // Split out the address for the bare-from / shared-domain checks.
  const fromStr = resolved.from || ''
  const angleMatch = fromStr.match(/<([^>]+)>/)
  const fromAddress = angleMatch ? angleMatch[1] : fromStr

  // Send pipelines always inject {{unsubscribeUrl}} and {{preferencesUrl}} —
  // signal that to the preflight runner so it doesn't error on inline content
  // that relies on those merge fields being present in the final body.
  return {
    subject,
    preheader,
    bodyHtml,
    bodyText,
    document,
    fromName: opts.fromName || orgName,
    fromAddress,
    hasUnsubscribeUrl: true,
    hasPreferencesUrl: true,
  }
}

export async function preflightInputForBroadcast(broadcast: Broadcast): Promise<PreflightInput> {
  return loadPreflight({
    orgId: broadcast.orgId,
    fromDomainId: broadcast.fromDomainId,
    fromName: broadcast.fromName,
    fromLocal: broadcast.fromLocal,
    templateId: broadcast.content?.templateId,
    inlineSubject: broadcast.content?.subject ?? '',
    inlinePreheader: broadcast.content?.preheader ?? '',
    inlineHtml: broadcast.content?.bodyHtml ?? '',
    inlineText: broadcast.content?.bodyText ?? '',
  })
}

export interface SequenceLikeForPreflight {
  orgId: string
  fromDomainId?: string
  fromName?: string
  fromLocal?: string
}

export async function preflightInputForSequenceStep(
  sequence: SequenceLikeForPreflight,
  step: SequenceStep,
): Promise<PreflightInput> {
  return loadPreflight({
    orgId: sequence.orgId,
    fromDomainId: sequence.fromDomainId,
    fromName: sequence.fromName,
    fromLocal: sequence.fromLocal,
    templateId: undefined,
    inlineSubject: step.subject ?? '',
    inlinePreheader: '',
    inlineHtml: step.bodyHtml ?? '',
    inlineText: step.bodyText ?? '',
  })
}
