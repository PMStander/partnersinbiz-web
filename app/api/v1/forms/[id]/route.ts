/**
 * GET    /api/v1/forms/:id — fetch a single form
 * PUT    /api/v1/forms/:id — update a form (slug only changeable pre-submission)
 * DELETE /api/v1/forms/:id — soft-delete (?force=true for hard-delete)
 *
 * Auth: GET → viewer+, PUT/DELETE → admin+
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth, type CrmAuthContext } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { VALID_FIELD_TYPES, type Form, type FormField } from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const UPDATABLE_FIELDS = [
  'name',
  'title',
  'description',
  'fields',
  'thankYouMessage',
  'notifyEmails',
  'redirectUrl',
  'createContact',
  'active',
  'rateLimitPerMinute',
  'slug',
] as const

function validateFields(fields: unknown): FormField[] | string {
  if (!Array.isArray(fields) || fields.length === 0) {
    return 'fields must be a non-empty array'
  }
  const seen = new Set<string>()
  const cleaned: FormField[] = []
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') return 'each field must be an object'
    const f = raw as Partial<FormField>
    if (!f.id || typeof f.id !== 'string') return 'field.id is required'
    if (seen.has(f.id)) return `Duplicate field id "${f.id}"`
    seen.add(f.id)
    if (!f.type || !VALID_FIELD_TYPES.includes(f.type)) {
      return `Invalid field.type for "${f.id}"`
    }
    if (!f.label || typeof f.label !== 'string') {
      return `field.label is required for "${f.id}"`
    }
    const needsOptions =
      f.type === 'select' || f.type === 'multiselect' || f.type === 'radio'
    if (needsOptions && (!Array.isArray(f.options) || f.options.length === 0)) {
      return `field "${f.id}" requires options[]`
    }
    cleaned.push({
      id: f.id,
      type: f.type,
      label: f.label,
      required: f.required === true,
      placeholder: f.placeholder,
      options: f.options,
      validation: f.validation,
    })
  }
  return cleaned
}

// ---------------------------------------------------------------------------
// Tenant-scoped loader — returns 404 for missing OR cross-org OR deleted docs
// ---------------------------------------------------------------------------

async function loadForm(id: string, ctxOrgId: string) {
  const ref = adminDb.collection('forms').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false as const, status: 404, error: 'Form not found' }
  const data = snap.data()!
  if (data.orgId !== ctxOrgId) return { ok: false as const, status: 404, error: 'Form not found' }
  if (data.deleted === true) return { ok: false as const, status: 404, error: 'Form not found' }
  return { ok: true as const, ref, snap, data: data as Form }
}

// ---------------------------------------------------------------------------
// GET — viewer+
// ---------------------------------------------------------------------------

export const GET = withCrmAuth<RouteCtx>('viewer', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const r = await loadForm(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)
  return apiSuccess({ id, ...r.data } as Form)
})

// ---------------------------------------------------------------------------
// PUT — shared handler (factored out for clarity)
// ---------------------------------------------------------------------------

async function handleFormUpdate(
  req: NextRequest,
  ctx: CrmAuthContext,
  id: string,
): Promise<Response> {
  const r = await loadForm(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  // Empty-body guard: check if any editable field is present
  const hasEditable = UPDATABLE_FIELDS.some((key) => body[key] !== undefined)
  if (!hasEditable) {
    return apiError('No editable fields supplied', 400)
  }

  const updates: Record<string, unknown> = {}

  // Collect all updatable fields except slug (handled separately)
  const nonSlugFields = UPDATABLE_FIELDS.filter((k) => k !== 'slug') as readonly string[]
  for (const key of nonSlugFields) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (updates.fields !== undefined) {
    const cleaned = validateFields(updates.fields)
    if (typeof cleaned === 'string') return apiError(cleaned)
    updates.fields = cleaned
  }

  // Slug change is restricted: only allowed if no submissions exist yet.
  if (body.slug !== undefined && body.slug !== r.data.slug) {
    const newSlug = String(body.slug).trim().toLowerCase()
    if (!SLUG_RE.test(newSlug)) {
      return apiError(
        'slug must be lowercase letters, numbers, and dashes (e.g. "contact-us")',
      )
    }

    const subsSnap = await adminDb
      .collection('form_submissions')
      .where('formId', '==', id)
      .limit(1)
      .get()
    if (!subsSnap.empty) {
      return apiError('Cannot change slug after submissions exist', 409)
    }

    // Uniqueness check against other forms in the same org.
    const clashSnap = await adminDb
      .collection('forms')
      .where('orgId', '==', r.data.orgId)
      .where('slug', '==', newSlug)
      .limit(2)
      .get()
    const clash = clashSnap.docs.find(
      (d) => d.id !== id && d.data()?.deleted !== true,
    )
    if (clash) return apiError(`Slug "${newSlug}" already exists in this org`, 409)

    updates.slug = newSlug
  }

  const actorRef = ctx.actor
  updates.updatedByRef = actorRef
  updates.updatedAt = FieldValue.serverTimestamp()

  // Omit updatedBy uid for agent calls
  if (!ctx.isAgent) {
    updates.updatedBy = actorRef.uid
  }

  // Sanitize: strip undefined values so Firestore doesn't reject
  const sanitized = Object.fromEntries(
    Object.entries(updates).filter(([, v]) => v !== undefined),
  )

  await r.ref.update(sanitized)
  const after = await r.ref.get()
  return apiSuccess({ ...(after.data() as Form), id })
}

export const PUT = withCrmAuth<RouteCtx>('admin', async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  return handleFormUpdate(req, ctx, id)
})

// ---------------------------------------------------------------------------
// DELETE — admin+
// ---------------------------------------------------------------------------

export const DELETE = withCrmAuth<RouteCtx>('admin', async (req: NextRequest, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const r = await loadForm(id, ctx.orgId)
  if (!r.ok) return apiError(r.error, r.status)

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  if (force) {
    await r.ref.delete()
  } else {
    const actorRef = ctx.actor
    const deletePatch: Record<string, unknown> = {
      deleted: true,
      active: false,
      updatedByRef: actorRef,
      updatedAt: FieldValue.serverTimestamp(),
    }

    // Omit updatedBy uid for agent calls
    if (!ctx.isAgent) {
      deletePatch.updatedBy = actorRef.uid
    }

    // Sanitize before write
    const sanitized = Object.fromEntries(
      Object.entries(deletePatch).filter(([, v]) => v !== undefined),
    )
    await r.ref.update(sanitized)
  }

  return apiSuccess({ id, deleted: true })
})
