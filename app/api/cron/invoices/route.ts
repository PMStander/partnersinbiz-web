// app/api/cron/invoices/route.ts
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'
import { calculateNextDueAt, RecurrenceInterval } from '@/lib/invoices/recurring'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)

  const now = Timestamp.now()

  const snap = await (adminDb.collection('recurring_schedules') as any)
    .where('status', '==', 'active')
    .where('nextDueAt', '<=', now)
    .get()

  let created = 0
  const errors: string[] = []

  for (const scheduleDoc of snap.docs) {
    try {
      const schedule = scheduleDoc.data()

      // Fetch template invoice
      const templateDoc = await adminDb.collection('invoices').doc(schedule.invoiceId).get()
      if (!templateDoc.exists) continue
      const template = templateDoc.data()!

      // Generate a fresh invoice number
      const invoiceNumber = await generateInvoiceNumber(
        template.orgId,
        template.clientDetails?.name ?? template.orgId,
      )

      // Compute relative dueDate if template had one
      let dueDate: any = null
      if (template.dueDate && template.issueDate) {
        const templateIssueSec = template.issueDate._seconds ?? (template.issueDate.toDate ? template.issueDate.toDate().getTime() / 1000 : null)
        const templateDueSec = template.dueDate._seconds ?? (template.dueDate.toDate ? template.dueDate.toDate().getTime() / 1000 : null)
        if (templateIssueSec && templateDueSec) {
          const offsetMs = (templateDueSec - templateIssueSec) * 1000
          dueDate = Timestamp.fromDate(new Date(Date.now() + offsetMs))
        }
      }

      // Create new draft invoice
      const invoiceDoc = {
        orgId: template.orgId,
        invoiceNumber,
        status: 'draft' as const,
        issueDate: FieldValue.serverTimestamp(),
        dueDate,
        lineItems: template.lineItems,
        subtotal: template.subtotal,
        taxRate: template.taxRate,
        taxAmount: template.taxAmount,
        total: template.total,
        currency: template.currency,
        notes: template.notes ?? '',
        fromDetails: template.fromDetails ?? null,
        clientDetails: template.clientDetails ?? null,
        paidAt: null,
        sentAt: null,
        recurringScheduleId: scheduleDoc.id,
        createdBy: 'cron',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      // Calculate next due date
      const lastDue: Date = schedule.nextDueAt.toDate()
      const nextDue = calculateNextDueAt(schedule.interval as RecurrenceInterval, lastDue)
      const nextDueTs = Timestamp.fromDate(nextDue)

      // Check if schedule should complete (endDate passed)
      const endDate: Date | null = schedule.endDate?.toDate() ?? null
      const isComplete = endDate !== null && nextDue > endDate

      // Atomic write: create invoice + update schedule together
      const invoiceRef = adminDb.collection('invoices').doc()
      const batch = adminDb.batch()
      batch.set(invoiceRef, invoiceDoc)
      batch.update(scheduleDoc.ref, {
        nextDueAt: nextDueTs,
        status: isComplete ? 'completed' : 'active',
        updatedAt: FieldValue.serverTimestamp(),
      })
      await batch.commit()

      created++
    } catch (err) {
      errors.push(`schedule ${scheduleDoc.id}: ${String(err)}`)
    }
  }

  return apiSuccess({ created, errors })
}
