// lib/email/domains.ts
//
// Per-org verified Resend sending domains. An org adds a domain
// (e.g. "ahs-law.co.za"), receives DNS records to add at their registrar,
// and once Resend marks the domain as `verified`, campaigns sent under that
// org can use sender addresses on the domain (e.g. noreply@ahs-law.co.za).
//
// When no verified domain exists, campaigns fall back to the shared PIB
// domain (`partnersinbiz.online`) — see `lib/email/resolveFrom.ts`.

import type { Timestamp } from 'firebase-admin/firestore'

export type EmailDomainStatus =
  | 'pending'           // local doc state before Resend confirms
  | 'not_started'       // Resend status — DNS not yet detected
  | 'verified'
  | 'failed'
  | 'temporary_failure'

export interface EmailDomainDnsRecord {
  record: string                 // e.g. "TXT", "CNAME", "MX"
  name: string                   // hostname to add at the registrar
  type?: string                  // sub-type when applicable (e.g. "DKIM", "SPF")
  ttl?: string | number
  status?: string                // Resend's per-record status
  value: string                  // the value to set
  priority?: number              // for MX
}

export interface EmailDomain {
  id: string                     // Firestore doc id
  orgId: string
  name: string                   // e.g. "ahs-law.co.za"
  resendDomainId: string         // id returned by Resend
  status: EmailDomainStatus
  region: string                 // Resend region
  dnsRecords: EmailDomainDnsRecord[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  lastSyncedAt: Timestamp | null
  deleted?: boolean
}

export type EmailDomainInput = Pick<EmailDomain, 'orgId' | 'name'>

// Domain-name validation: simple, conservative regex. Excludes leading/
// trailing dashes and requires a TLD. Enough to catch typos before we
// hand the value to Resend.
export function isValidDomainName(name: string): boolean {
  if (!name) return false
  const trimmed = name.trim().toLowerCase()
  if (trimmed.length > 253) return false
  return /^(?!-)([a-z0-9-]+(?<!-)\.)+[a-z]{2,}$/.test(trimmed)
}
