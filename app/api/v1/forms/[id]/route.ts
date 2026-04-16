/**
 * GET    /api/v1/forms/:id — fetch a single form
 * PUT    /api/v1/forms/:id — update a form (slug only changeable pre-submission)
 * DELETE /api/v1/forms/:id — soft-delete (?force=true for hard-delete)
 *
 * Auth: admin (AI/admin)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import { VALID_FIELD_TYPES, type Form, type FormField } from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

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

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params
  const doc = await adminDb.collection('forms').doc(id).get()
  if (!doc.exists) return apiError('Form not found', 404)
  const data = doc.data() as Form | undefined
  if (!data || data.deleted === true) return apiError('Form not found', 404)
  return apiSuccess({ ...data, id: doc.id })
})

export const PUT = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('forms').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Form not found', 404)
  const existing = doc.data() as Form | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Form not found', 404)
  }

  const body = (await req.json()) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  if (updates.fields !== undefined) {
    const cleaned = validateFields(updates.fields)
    if (typeof cleaned === 'string') return apiError(cleaned)
    updates.fields = cleaned
  }

  // Slug change is restricted: only allowed if no submissions exist yet.
  if (body.slug !== undefined && body.slug !== existing.slug) {
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
      .where('orgId', '==', existing.orgId)
      .where('slug', '==', newSlug)
      .limit(2)
      .get()
    const clash = clashSnap.docs.find(
      (d) => d.id !== id && d.data()?.deleted !== true,
    )
    if (clash) return apiError(`Slug "${newSlug}" already exists in this org`, 409)

    updates.slug = newSlug
  }

  await ref.update({
    ...updates,
    ...lastActorFrom(user),
  })

  const after = await ref.get()
  return apiSuccess({ ...(after.data() as Form), id })
})

export const DELETE = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('forms').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Form not found', 404)

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  if (force) {
    await ref.delete()
  } else {
    await ref.update({
      deleted: true,
      active: false,
      ...lastActorFrom(user),
      updatedAt: FieldValue.serverTimestamp(),
    })
  }

  return apiSuccess({ id, deleted: true })
})
