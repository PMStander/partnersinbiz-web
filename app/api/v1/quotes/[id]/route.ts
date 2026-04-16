// app/api/v1/quotes/[id]/route.ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('quotes').doc(id).get()
  if (!doc.exists) return apiError('Quote not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PATCH = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))
  const ref = adminDb.collection('quotes').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Quote not found', 404)
  const quoteData = doc.data()!

  // Handle convert-to-invoice action
  if (body.action === 'convert-to-invoice') {
    if (quoteData.status !== 'accepted') {
      return apiError('Only accepted quotes can be converted to invoices', 400)
    }
    if (quoteData.convertedInvoiceId) {
      return apiError('Quote has already been converted', 400)
    }

    // Fetch client org name for invoice number
    const clientOrgDoc = await adminDb.collection('organizations').doc(quoteData.orgId).get()
    const clientName = clientOrgDoc.exists ? clientOrgDoc.data()!.name : 'Unknown'

    const invoiceNumber = await generateInvoiceNumber(quoteData.orgId, clientName)

    // Create invoice from quote data
    const invoiceDoc = {
      orgId: quoteData.orgId,
      invoiceNumber,
      status: 'draft' as const,
      issueDate: FieldValue.serverTimestamp(),
      dueDate: null,
      lineItems: quoteData.lineItems,
      subtotal: quoteData.subtotal,
      taxRate: quoteData.taxRate,
      taxAmount: quoteData.taxAmount,
      total: quoteData.total,
      currency: quoteData.currency,
      notes: quoteData.notes,
      fromDetails: quoteData.fromDetails,
      clientDetails: quoteData.clientDetails,
      paidAt: null,
      sentAt: null,
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    const invoiceRef = await adminDb.collection('invoices').add(invoiceDoc)

    // Mark quote as converted
    await ref.update({
      status: 'converted',
      convertedInvoiceId: invoiceRef.id,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return apiSuccess({ invoiceId: invoiceRef.id, invoiceNumber })
  }

  // Regular status updates
  const updates: Record<string, any> = { ...body, updatedAt: FieldValue.serverTimestamp() }

  if (body.status === 'accepted' && quoteData.status !== 'accepted') {
    updates.acceptedAt = FieldValue.serverTimestamp()
  }
  if (body.status === 'sent' && quoteData.status === 'draft') {
    updates.sentAt = FieldValue.serverTimestamp()
  }

  await ref.update(updates)
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  await adminDb.collection('quotes').doc(id).delete()
  return apiSuccess({ deleted: true })
})
