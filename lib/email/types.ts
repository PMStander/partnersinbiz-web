// lib/email/types.ts
import type { Timestamp } from 'firebase-admin/firestore'

export type EmailDirection = 'outbound' | 'inbound'

export type EmailStatus =
  | 'draft'
  | 'scheduled'
  | 'sent'
  | 'failed'
  | 'opened'
  | 'clicked'

export type EmailProviderId = 'resend' | 'ses' | ''

export interface Email {
  id: string
  orgId: string            // required after Phase 1 backfill
  campaignId: string       // "" if not part of a campaign
  broadcastId: string      // "" if not part of a broadcast
  fromDomainId: string     // "" if sent from shared PIB domain
  direction: EmailDirection
  contactId: string        // "" if none linked
  // resendId is the legacy name for the provider message ID. New writes still
  // populate it for back-compat with existing indexes and the Resend webhook
  // lookup. New code should read `providerMessageId` instead.
  resendId: string
  provider: EmailProviderId       // "" for older rows pre-provider-abstraction
  providerMessageId: string       // provider-issued message ID (same value as resendId)
  from: string
  to: string
  cc: string[]
  subject: string
  bodyHtml: string
  bodyText: string
  status: EmailStatus
  scheduledFor: Timestamp | null
  sentAt: Timestamp | null
  openedAt: Timestamp | null
  clickedAt: Timestamp | null
  bouncedAt: Timestamp | null
  sequenceId: string       // "" if not part of a sequence
  sequenceStep: number | null
  // A/B testing — when the parent broadcast or sequence step has an active
  // AbConfig, this is the variant id (e.g. "a", "b") that this particular
  // email was sent as. "" when no A/B testing applied. The webhook uses this
  // to attribute opens / clicks / bounces back to the correct variant.
  variantId: string
  createdAt: Timestamp | null
  deleted?: boolean
}

export type EmailInput = Omit<Email, 'id' | 'createdAt' | 'resendId' | 'provider' | 'providerMessageId'>

export interface EmailListParams {
  direction?: EmailDirection
  status?: EmailStatus
  contactId?: string
  limit?: number
  page?: number
}
