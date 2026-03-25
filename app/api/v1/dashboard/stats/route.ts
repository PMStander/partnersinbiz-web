// app/api/v1/dashboard/stats/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest, _user) => {
  const [
    contactsSnap,
    dealsSnap,
    emailSentSnap,
    emailOpenedSnap,
    activeSeqSnap,
    activeEnrollSnap,
  ] = await Promise.all([
    (adminDb.collection('contacts') as any).get(),
    (adminDb.collection('deals') as any).get(),
    (adminDb.collection('emails') as any).where('status', '==', 'sent').get(),
    (adminDb.collection('emails') as any).where('status', '==', 'opened').get(),
    (adminDb.collection('sequences') as any).where('status', '==', 'active').get(),
    (adminDb.collection('sequence_enrollments') as any).where('status', '==', 'active').get(),
  ])

  const contacts = contactsSnap.docs.map((d: any) => d.data()).filter((c: any) => c.deleted !== true)
  const deals = dealsSnap.docs.map((d: any) => d.data()).filter((d: any) => d.deleted !== true)
  const pipelineValue = deals.reduce((sum: number, d: any) => sum + (d.value ?? 0), 0)
  const wonValue = deals
    .filter((d: any) => d.stage === 'won')
    .reduce((sum: number, d: any) => sum + (d.value ?? 0), 0)

  return apiSuccess({
    contacts: { total: contacts.length },
    deals: { total: deals.length, pipelineValue, wonValue },
    email: { sent: emailSentSnap.docs.length, opened: emailOpenedSnap.docs.length },
    sequences: { active: activeSeqSnap.docs.length, activeEnrollments: activeEnrollSnap.docs.length },
  })
})
