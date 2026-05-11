// lib/sequences/types.ts
import type { Timestamp } from 'firebase-admin/firestore'
import type { AbConfig } from '@/lib/ab-testing/types'

export interface SequenceStep {
  stepNumber: number
  delayDays: number
  subject: string
  bodyHtml: string
  bodyText: string
  // Optional A/B testing config for this step. Backwards-compatible — existing
  // steps without `ab` continue to send as a single variant.
  ab?: AbConfig
}

export type SequenceStatus = 'draft' | 'active' | 'paused'

export interface Sequence {
  id: string
  orgId: string            // required after Phase 1 backfill
  name: string
  description: string
  status: SequenceStatus
  steps: SequenceStep[]
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deleted?: boolean
}

export type SequenceInput = Omit<Sequence, 'id' | 'createdAt' | 'updatedAt'>

export type EnrollmentStatus = 'active' | 'completed' | 'paused' | 'exited'
export type ExitReason = 'replied' | 'unsubscribed' | 'manual' | 'completed' | 'bounced'

export interface SequenceEnrollment {
  id: string
  orgId: string            // required after Phase 1 backfill
  campaignId: string       // "" if direct sequence enrollment, populated when triggered by a Campaign
  sequenceId: string
  contactId: string
  status: EnrollmentStatus
  currentStep: number        // 0-based index into sequence.steps
  enrolledAt: Timestamp | null
  nextSendAt: Timestamp | null
  exitReason?: ExitReason
  completedAt?: Timestamp | null
  deleted?: boolean
}

export type EnrollmentInput = Omit<SequenceEnrollment, 'id' | 'enrolledAt'>
