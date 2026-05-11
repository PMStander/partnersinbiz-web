// app/api/v1/sequence-enrollments/[id]/path/route.ts
//
// Returns the path the contact has taken through the sequence so far.
// Steps sent, branches evaluated, the current state. Used by the admin
// UI to render a contact-journey trail.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import type { SequenceEnrollment, EnrollmentPathEntry } from '@/lib/sequences/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequence_enrollments').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const enrollment = snap.data() as SequenceEnrollment
  const scope = resolveOrgScope(user, enrollment.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  // Pull the sequence to fetch step labels for the UI.
  const seqSnap = await adminDb.collection('sequences').doc(enrollment.sequenceId).get()
  const seq = seqSnap.exists ? seqSnap.data() : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const steps: any[] = (seq?.steps ?? []) as any[]

  const path: EnrollmentPathEntry[] = Array.isArray(enrollment.path) ? enrollment.path : []
  const decorated = path.map((entry) => ({
    ...entry,
    stepSubject:
      entry.stepNumber >= 0 && entry.stepNumber < steps.length
        ? steps[entry.stepNumber]?.subject ?? ''
        : '',
  }))

  // Also pull every email sent for this enrollment for a richer history.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailsSnap = await (adminDb.collection('emails') as any)
    .where('sequenceId', '==', enrollment.sequenceId)
    .where('contactId', '==', enrollment.contactId)
    .get()
  const emails = emailsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => {
      const data = d.data()
      return {
        id: d.id,
        stepNumber: data.sequenceStep ?? null,
        subject: data.subject ?? '',
        sentAt: data.sentAt ?? null,
        openedAt: data.openedAt ?? null,
        clickedAt: data.clickedAt ?? null,
        status: data.status ?? '',
      }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .sort((a: any, b: any) => {
      const am = a.sentAt?.toMillis?.() ?? 0
      const bm = b.sentAt?.toMillis?.() ?? 0
      return am - bm
    })

  return apiSuccess({
    enrollmentId: id,
    sequenceId: enrollment.sequenceId,
    contactId: enrollment.contactId,
    status: enrollment.status,
    currentStep: enrollment.currentStep,
    exitReason: enrollment.exitReason ?? null,
    pendingBranchEvalAt: enrollment.pendingBranchEvalAt ?? null,
    waitingSince: enrollment.waitingSince ?? null,
    visitedSteps: enrollment.visitedSteps ?? [],
    path: decorated,
    emails,
  })
})
