// app/api/v1/quotes/route.ts
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')

  let query = adminDb.collection('quotes').orderBy('createdAt', 'desc') as any
  if (orgId) query = query.where('orgId', '==', orgId)

  const snapshot = await query.limit(50).get()
  const quotes = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(quotes)
})

export const POST = withAuth('admin', async (req, user) => {
  const body = await req.json().catch(() => ({}))
  if (!body.orgId) return apiError('orgId is required', 400)
  if (!body.lineItems?.length) return apiError('At least one line item is required', 400)

  // Fetch client org
  const clientOrgDoc = await adminDb.collection('organizations').doc(body.orgId).get()
  if (!clientOrgDoc.exists) return apiError('Client organisation not found', 404)
  const clientOrg = clientOrgDoc.data()!
  const clientBilling = clientOrg.billingDetails ?? {}

  // Fetch platform owner for "from" details
  const platformSnap = await adminDb
    .collection('organizations')
    .where('type', '==', 'platform_owner')
    .limit(1)
    .get()

  let fromDetails: Record<string, any> = { companyName: 'Partners in Biz' }
  if (!platformSnap.empty) {
    const platform = platformSnap.docs[0].data()
    const pb = platform.billingDetails ?? {}
    fromDetails = {
      companyName: platform.name,
      address: pb.address ?? undefined,
      email: platform.billingEmail ?? platform.settings?.notificationEmail ?? undefined,
      phone: pb.phone ?? undefined,
      vatNumber: pb.vatNumber ?? undefined,
      registrationNumber: pb.registrationNumber ?? undefined,
      website: platform.website ?? undefined,
      logoUrl: platform.brandProfile?.logoUrl ?? platform.logoUrl ?? undefined,
      bankingDetails: pb.bankingDetails ?? undefined,
    }
  }

  const clientDetails = {
    name: clientOrg.name,
    address: clientBilling.address ?? undefined,
    email: clientOrg.billingEmail ?? clientOrg.settings?.notificationEmail ?? undefined,
    vatNumber: clientBilling.vatNumber ?? undefined,
  }

  // Generate quote number: Q-CLI-001
  // Uses an atomic transaction on a counter document to prevent duplicates under concurrent requests.
  const alphaOnly = clientOrg.name.replace(/[^a-zA-Z]/g, '')
  const prefix = (alphaOnly.length >= 3 ? alphaOnly.slice(0, 3) : alphaOnly.padEnd(3, 'X')).toUpperCase()
  const quoteCounterRef = adminDb
    .collection('organizations')
    .doc(body.orgId)
    .collection('counters')
    .doc('quotes')
  const quoteCount = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(quoteCounterRef)
    const next = snap.exists ? (snap.data()!.count as number) + 1 : 1
    tx.set(quoteCounterRef, { count: next }, { merge: true })
    return next
  })
  const quoteNumber = `Q-${prefix}-${String(quoteCount).padStart(3, '0')}`

  // Calculate totals
  const lineItems = body.lineItems.map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    amount: Number(item.quantity) * Number(item.unitPrice),
  }))
  const subtotal = lineItems.reduce((sum: number, item: any) => sum + item.amount, 0)
  const taxRate = Number(body.taxRate ?? 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  const doc = {
    orgId: body.orgId,
    quoteNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    validUntil: body.validUntil ? new Date(body.validUntil) : null,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: body.currency ?? clientOrg.settings?.currency ?? 'USD',
    notes: body.notes ?? '',
    fromDetails,
    clientDetails,
    convertedInvoiceId: null,
    sentAt: null,
    acceptedAt: null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('quotes').add(doc)

  try {
    await dispatchWebhook(body.orgId, 'quote.created', {
      id: ref.id,
      quoteNumber,
      total,
      currency: doc.currency,
      clientOrgId: body.orgId,
    })
  } catch (err) {
    console.error('[webhook-dispatch-error] quote.created', err)
  }

  return apiSuccess({ id: ref.id, quoteNumber }, 201)
})
