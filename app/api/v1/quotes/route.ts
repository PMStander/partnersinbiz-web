// app/api/v1/quotes/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import type { Quote } from '@/lib/quotes/types'

export const dynamic = 'force-dynamic'

export const GET = withCrmAuth('viewer', async (_req: NextRequest, ctx) => {
  const snapshot = await adminDb
    .collection('quotes')
    .where('orgId', '==', ctx.orgId)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get()

  const quotes = snapshot.docs.map((doc: any) => ({ ...(doc.data() as Quote), id: doc.id }))
  return apiSuccess({ quotes })
})

export const POST = withCrmAuth('member', async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => ({}))
  if (!body.lineItems?.length) return apiError('At least one line item is required', 400)

  // Fetch client org for prefix + billing + currency
  const clientOrgDoc = await adminDb.collection('organizations').doc(ctx.orgId).get()
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
    .doc(ctx.orgId)
    .collection('counters')
    .doc('quotes')
  let quoteCount = 1
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(quoteCounterRef)
    const next = snap.exists ? (snap.data()!.count as number) + 1 : 1
    tx.set(quoteCounterRef, { count: next }, { merge: true })
    quoteCount = next
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

  const actorRef = ctx.actor

  const quoteData: Record<string, unknown> = {
    orgId: ctx.orgId,
    quoteNumber,
    status: 'draft' as const,
    issueDate: FieldValue.serverTimestamp(),
    validUntil: body.validUntil ? new Date(body.validUntil) : null,
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    total,
    currency: body.currency ?? clientOrg.settings?.currency ?? 'ZAR',
    notes: body.notes ?? '',
    fromDetails,
    clientDetails,
    convertedInvoiceId: null,
    sentAt: null,
    acceptedAt: null,
    createdByRef: actorRef,
    updatedByRef: actorRef,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  // Omit createdBy / updatedBy uid for agent calls
  if (!ctx.isAgent) {
    quoteData.createdBy = actorRef.uid
    quoteData.updatedBy = actorRef.uid
  }

  // Strip undefined values so Firestore doesn't reject
  const sanitized = Object.fromEntries(Object.entries(quoteData).filter(([, v]) => v !== undefined))

  const docRef = adminDb.collection('quotes').doc()
  await docRef.set(sanitized)

  // Explicit-field webhook payload (PR 3+ pattern — no body spread)
  try {
    await dispatchWebhook(ctx.orgId, 'quote.created', {
      id: docRef.id,
      quoteNumber,
      status: 'draft',
      total,
      currency: sanitized.currency as string,
      validUntil: sanitized.validUntil ?? null,
      createdByRef: actorRef,
    })
  } catch (err) {
    console.error('[webhook-dispatch-error] quote.created', err)
  }

  return apiSuccess({ ...sanitized, id: docRef.id }, 201)
})
