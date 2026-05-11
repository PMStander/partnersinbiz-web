// lib/sms/types.ts
//
// Outbound + inbound SMS docs and the Sms / SmsStatus types used across the
// stack. Mirrors the shape of the `emails` collection for symmetry — same
// (orgId, campaignId, broadcastId, sequenceId, sequenceStep) fan-out so the
// existing email-analytics roll-ups can be cloned for SMS later.

import type { Timestamp } from 'firebase-admin/firestore'

export type SmsDirection = 'outbound' | 'inbound'

export type SmsStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'undelivered'

export interface Sms {
  id: string
  orgId: string
  direction: SmsDirection
  contactId: string
  twilioSid: string
  from: string
  to: string
  body: string
  status: SmsStatus
  segmentsCount: number
  costEstimateUsd: number
  sequenceId: string
  sequenceStep: number | null
  campaignId: string
  broadcastId: string
  topicId: string
  variantId: string
  sentAt: Timestamp | null
  deliveredAt: Timestamp | null
  failedAt: Timestamp | null
  failureReason: string
  scheduledFor: Timestamp | null
  createdAt: Timestamp | null
  deleted?: boolean
}

export type SmsInput = Omit<Sms, 'id' | 'createdAt'>
