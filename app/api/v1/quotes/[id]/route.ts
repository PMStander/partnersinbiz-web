// app/api/v1/quotes/[id]/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth, type CrmAuthContext } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generateInvoiceNumber } from '@/lib/invoices/invoice-number'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import type { Quote } from '@/lib/quotes/types'
import type { MemberRef } from '@/lib/orgMembers/memberRef'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

// ---------------------------------------------------------------------------
// Tenant-scoped loader — returns 404 for missing OR cross-org OR deleted docs
// ---------------------------------------------------------------------------

async function loadQuote(id: string, ctxOrgId: string) {
  const ref = adminDb.collection('quotes').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false as const, status: 404, error: 'Quote not found' }
  const data = snap.data() as Quote
  if (data.orgId !== ctxOrgId) return { ok: false as const, status: 404, error: 'Quote not found' }
  if ((data as any).deleted === true) return { ok: false as const, status: 404, error: 'Quote not found' }
  return { ok: true as const, ref, data }
}

// ---------------------------------------------------------------------------
// GET — viewer+
// ---------------------------------------------------------------------------

export const GET = withCrmAuth<RouteCtx>('viewer', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const r = await loadQuote(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)
  return apiSuccess({ quote: { ...r.data, id } })
})

// ---------------------------------------------------------------------------
// PATCH — member+
// ---------------------------------------------------------------------------

// Allowlist of editable fields beyond the internal meta fields
const EDITABLE_FIELDS = ['status', 'notes', 'validUntil', 'lineItems', 'subtotal', 'taxRate', 'taxAmount', 'total', 'currency', 'fromDetails', 'clientDetails'] as const

async function handleQuoteUpdate(
  req: NextRequest,
  ctx: CrmAuthContext,
  routeCtx: RouteCtx | undefined,
): Promise<Response> {
  const { id } = await routeCtx!.params
  const r = await loadQuote(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return apiError('Invalid JSON body', 400)
  }

  const actorRef: MemberRef = ctx.actor
  const before = r.data

  // -------------------------------------------------------------------------
  // SPECIAL PATH: convert-to-invoice
  // -------------------------------------------------------------------------
  if (body.action === 'convert-to-invoice') {
    if (before.status !== 'accepted') {
      return apiError('Only accepted quotes can be converted to invoices', 400)
    }
    if (before.convertedInvoiceId) {
      return apiError('Quote has already been converted', 400)
    }

    // Fetch client org name for invoice number generation
    const clientOrgDoc = await adminDb.collection('organizations').doc(ctx.orgId).get()
    const clientName = clientOrgDoc.exists ? clientOrgDoc.data()!.name : 'Unknown'

    let invoiceNumber: string
    try {
      invoiceNumber = await generateInvoiceNumber(ctx.orgId, clientName)
    } catch (err) {
      console.error('[invoice-number-error] generateInvoiceNumber', err)
      return apiError('Failed to generate invoice number', 500)
    }

    // Create invoice from quote data
    const invoiceDoc: Record<string, unknown> = {
      orgId: ctx.orgId,
      invoiceNumber,
      status: 'draft' as const,
      issueDate: FieldValue.serverTimestamp(),
      dueDate: null,
      lineItems: before.lineItems,
      subtotal: before.subtotal,
      taxRate: before.taxRate,
      taxAmount: before.taxAmount,
      total: before.total,
      currency: before.currency,
      notes: before.notes,
      fromDetails: before.fromDetails,
      clientDetails: before.clientDetails,
      paidAt: null,
      sentAt: null,
      createdByRef: actorRef,
      updatedByRef: actorRef,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    // Omit createdBy / updatedBy uid for agent calls (PR 3 pattern)
    if (!ctx.isAgent) {
      invoiceDoc.createdBy = actorRef.uid
      invoiceDoc.updatedBy = actorRef.uid
    }

    const invoiceRef = await adminDb.collection('invoices').add(
      Object.fromEntries(Object.entries(invoiceDoc).filter(([, v]) => v !== undefined)),
    )

    // Mark quote as converted
    await r.ref.update({
      status: 'converted',
      convertedInvoiceId: invoiceRef.id,
      updatedByRef: actorRef,
      updatedAt: FieldValue.serverTimestamp(),
    })

    return apiSuccess({ invoiceId: invoiceRef.id, invoiceNumber })
  }

  // -------------------------------------------------------------------------
  // REGULAR PATH: status update + other field updates
  // -------------------------------------------------------------------------

  // Empty-body guard: at least one editable field must be present
  const hasEditable = EDITABLE_FIELDS.some((f) => body[f] !== undefined)
  if (!hasEditable) return apiError('No editable fields supplied', 400)

  const patch: Record<string, unknown> = {
    updatedByRef: actorRef,
    updatedAt: FieldValue.serverTimestamp(),
  }

  // Only set updatedBy uid for human (non-agent) callers
  if (!ctx.isAgent) {
    patch.updatedBy = actorRef.uid
  }

  // Apply allowlisted editable fields from body
  for (const field of EDITABLE_FIELDS) {
    if (body[field] !== undefined) {
      patch[field] = body[field]
    }
  }

  const fromStatus = before.status
  const toStatus = typeof body.status === 'string' ? body.status : undefined
  const statusChanged = toStatus !== undefined && toStatus !== fromStatus

  // Side effects on status transitions
  if (statusChanged) {
    if (fromStatus === 'draft' && toStatus === 'sent') {
      patch.sentAt = FieldValue.serverTimestamp()
    }
    if (toStatus === 'accepted') {
      patch.acceptedAt = FieldValue.serverTimestamp()
    }
  }

  // Firestore rejects undefined values — strip them before write
  const sanitized = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  await r.ref.update(sanitized)

  // Dispatch status-change webhooks (explicit-field payload, PR 3+ pattern — no body spread)
  if (statusChanged) {
    if (toStatus === 'accepted') {
      try {
        await dispatchWebhook(ctx.orgId, 'quote.accepted', {
          id,
          quoteNumber: before.quoteNumber,
          total: before.total,
          currency: before.currency,
          updatedByRef: actorRef,
        })
      } catch (err) {
        console.error('[webhook-dispatch-error] quote.accepted', err)
      }
    } else if (toStatus === 'rejected') {
      try {
        await dispatchWebhook(ctx.orgId, 'quote.rejected', {
          id,
          quoteNumber: before.quoteNumber,
          total: before.total,
          currency: before.currency,
          updatedByRef: actorRef,
        })
      } catch (err) {
        console.error('[webhook-dispatch-error] quote.rejected', err)
      }
    }
  }

  return apiSuccess({ quote: { ...before, ...sanitized, id } })
}

export const PATCH = withCrmAuth<RouteCtx>('member', handleQuoteUpdate)

// ---------------------------------------------------------------------------
// DELETE — admin+ (hard delete, matching baseline behaviour)
// ---------------------------------------------------------------------------

export const DELETE = withCrmAuth<RouteCtx>('admin', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const r = await loadQuote(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)
  await r.ref.delete()
  return apiSuccess({ id })
})
