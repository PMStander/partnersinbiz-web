import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (_req: NextRequest, user, ctx) => {
  const { id } = await (ctx as RouteContext).params

  const sourceDoc = await adminDb.collection('invoices').doc(id).get()
  if (!sourceDoc.exists) return apiError('Invoice not found', 404)
  const source = sourceDoc.data()!

  const invoiceNumber = await generateInvoiceNumber(source.orgId, source.clientDetails?.name ?? source.orgId)

  const doc = {
    orgId: source.orgId,
    invoiceNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    dueDate: source.dueDate ?? null,
    lineItems: source.lineItems,
    subtotal: source.subtotal,
    taxRate: source.taxRate,
    taxAmount: source.taxAmount,
    total: source.total,
    currency: source.currency,
    notes: source.notes ?? '',
    fromDetails: source.fromDetails ?? null,
    clientDetails: source.clientDetails ?? null,
    paidAt: null,
    sentAt: null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('invoices').add(doc)
  return apiSuccess({ id: ref.id, invoiceNumber }, 201)
})
