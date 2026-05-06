// lib/email/resolveFrom.ts
//
// Picks the right "from" address for a campaign email:
//   1. If a verified per-org EmailDomain is configured for the campaign,
//      use it (`<fromName> <local@verified-domain>`).
//   2. Otherwise fall back to the shared PIB sending domain.
//
// The fallback always wins when the verified domain is not yet `verified`
// (e.g. waiting on DNS) — we never send from a domain Resend hasn't OK'd.

import { adminDb } from '@/lib/firebase/admin'
import type { EmailDomain } from '@/lib/email/domains'
import {
  SHARED_SENDER_DOMAIN,
  SHARED_SENDER_LOCAL,
  SHARED_SENDER_NAME,
} from '@/lib/platform/constants'

export interface ResolvedSender {
  from: string                   // ready to pass to resend.emails.send()
  fromDomainId: string           // "" when fallback was used
  fromDomain: string             // the actual domain used
  isFallback: boolean
}

export interface ResolveFromInput {
  fromDomainId?: string          // EmailDomain doc id, optional
  fromName?: string              // display name override; defaults to org/sender
  fromLocal?: string             // local-part override (e.g. "noreply"); defaults to "campaigns"
  orgName?: string               // used as the display name when fromName not set
}

function formatAddress(name: string | undefined, address: string): string {
  return name && name.trim() ? `${name.trim()} <${address}>` : address
}

function fallbackSender(input: ResolveFromInput): ResolvedSender {
  const local = input.fromLocal?.trim() || SHARED_SENDER_LOCAL
  const name = input.fromName?.trim() || input.orgName?.trim() || SHARED_SENDER_NAME
  return {
    from: formatAddress(name, `${local}@${SHARED_SENDER_DOMAIN}`),
    fromDomainId: '',
    fromDomain: SHARED_SENDER_DOMAIN,
    isFallback: true,
  }
}

export async function resolveFrom(input: ResolveFromInput): Promise<ResolvedSender> {
  const fromDomainId = input.fromDomainId?.trim() ?? ''
  if (!fromDomainId) return fallbackSender(input)

  const snap = await adminDb.collection('email_domains').doc(fromDomainId).get()
  if (!snap.exists) return fallbackSender(input)
  const domain = { id: snap.id, ...snap.data() } as EmailDomain

  if (domain.deleted || domain.status !== 'verified') return fallbackSender(input)

  const local = input.fromLocal?.trim() || 'campaigns'
  const name = input.fromName?.trim() || input.orgName?.trim() || ''
  return {
    from: formatAddress(name, `${local}@${domain.name}`),
    fromDomainId: domain.id,
    fromDomain: domain.name,
    isFallback: false,
  }
}
