/**
 * GET    /api/v1/crm/contacts/:id  — get one contact
 * PUT    /api/v1/crm/contacts/:id  — update contact (full replace)
 * PATCH  /api/v1/crm/contacts/:id  — update contact (alias for PUT)
 * DELETE /api/v1/crm/contacts/:id  — soft delete (sets deleted: true)
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'
import { logActivity } from '@/lib/activity/log'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('contacts').doc(id).get()
  if (!doc.exists) return apiError('Contact not found', 404)
  const scope = resolveOrgScope(user, (doc.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PUT = withAuth('client', async (req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('contacts').doc(id).get()
  if (!doc.exists) return apiError('Contact not found', 404)
  const existing = doc.data() ?? {}
  const scope = resolveOrgScope(user, (existing.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const body = await req.json()
  await adminDb.collection('contacts').doc(id).update({
    ...body,
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Prefer orgId from body if provided (rare on PUT), else fall back to existing doc.
  const orgId =
    (typeof body?.orgId === 'string' && body.orgId) ||
    (typeof existing.orgId === 'string' && existing.orgId) ||
    undefined

  if (orgId) {
    try {
      await dispatchWebhook(orgId, 'contact.updated', { id, ...body })
    } catch (err) {
      console.error('[webhook-dispatch-error] contact.updated', err)
    }
    logActivity({
      orgId,
      type: 'crm_contact_updated',
      actorId: user.uid,
      actorName: user.uid,
      actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
      description: 'Updated contact',
      entityId: id,
      entityType: 'contact',
    }).catch(() => {})
  } else {
    console.warn('[webhook-dispatch-skip] contact.updated — no orgId on contact', id)
  }

  return apiSuccess({ id })
})

export const PATCH = PUT

export const DELETE = withAuth('client', async (_req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('contacts').doc(id).get()
  if (!doc.exists) return apiError('Contact not found', 404)
  const existing = doc.data() ?? {}
  const scope = resolveOrgScope(user, (existing.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  await adminDb.collection('contacts').doc(id).update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })

  const orgId = typeof existing.orgId === 'string' ? existing.orgId : undefined
  if (orgId) {
    logActivity({
      orgId,
      type: 'crm_contact_deleted',
      actorId: user.uid,
      actorName: user.uid,
      actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
      description: 'Deleted contact',
      entityId: id,
      entityType: 'contact',
    }).catch(() => {})
  }

  return apiSuccess({ id })
})
