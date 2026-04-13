import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')

  let query = adminDb.collection('invoices').orderBy('createdAt', 'desc') as any
  if (orgId) query = query.where('orgId', '==', orgId)

  const snapshot = await query.limit(50).get()
  const invoices = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(invoices)
})

export const POST = withAuth('admin', async (req, user) => {
  const body = await req.json().catch(() => ({}))
  if (!body.orgId) return apiError('orgId is required', 400)
  if (!body.lineItems?.length) return apiError('At least one line item is required', 400)

  // Auto-generate invoice number
  const countSnap = await adminDb.collection('invoices').count().get()
  const count = countSnap.data().count + 1
  const invoiceNumber = `PIB-${new Date().getFullYear()}-${String(count).padStart(3, '0')}`

  // Calculate totals
  const lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }> = body.lineItems.map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.quantity) * Number(item.unitPrice),
  }))
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0)
  const taxRate = Number(body.taxRate ?? 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  const doc = {
    orgId: body.orgId,
    invoiceNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: body.currency ?? 'USD',
    notes: body.notes ?? '',
    paidAt: null,
    sentAt: null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('invoices').add(doc)
  return apiSuccess({ id: ref.id, invoiceNumber }, 201)
})
