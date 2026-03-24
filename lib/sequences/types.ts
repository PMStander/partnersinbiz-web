// lib/sequences/types.ts
import type { Timestamp } from 'firebase-admin/firestore'

export interface SequenceStep {
  stepNumber: number
  delayDays: number
  subject: string
  bodyHtml: string
  bodyText: string
}

export type SequenceStatus = 'draft' | 'active' | 'paused'

export interface Sequence {
  id: string
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
export type ExitReason = 'replied' | 'unsubscribed' | 'manual' | 'completed'

export interface SequenceEnrollment {
  id: string
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
