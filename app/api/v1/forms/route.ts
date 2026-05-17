/**
 * GET  /api/v1/forms — list forms for the authenticated org (filterable, paginated)
 * POST /api/v1/forms — create a new form
 *
 * Auth: GET → viewer+, POST → admin+
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_FIELD_TYPES,
  type Form,
  type FormField,
  type FormInput,
} from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
    const needsOptions = f.type === 'select' || f.type === 'multiselect' || f.type === 'radio'
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

export const GET = withCrmAuth('viewer', async (_req: NextRequest, ctx) => {
  const orgId = ctx.orgId

  const { searchParams } = new URL(_req.url)
  const activeParam = searchParams.get('active')
  const search = (searchParams.get('search') ?? '').trim().toLowerCase()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('forms')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')

  if (activeParam === 'true') query = query.where('active', '==', true)
  if (activeParam === 'false') query = query.where('active', '==', false)

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  let forms: Form[] = snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((f: Form) => f.deleted !== true)

  if (search) {
    forms = forms.filter((f) => f.name?.toLowerCase().includes(search))
  }

  return apiSuccess(forms, 200, { total: forms.length, page, limit })
})

export const POST = withCrmAuth('admin', async (req: NextRequest, ctx) => {
  const body = await req.json().catch(() => null) as FormInput | null
  if (!body) return apiError('Invalid JSON', 400)

  const orgId = ctx.orgId
  if (!body.name?.trim()) return apiError('name is required')
  if (!body.slug?.trim()) return apiError('slug is required')

  const slug = body.slug.trim().toLowerCase()
  if (!SLUG_RE.test(slug)) {
    return apiError(
      'slug must be lowercase letters, numbers, and dashes (e.g. "contact-us")',
    )
  }

  const fieldsOrError = validateFields(body.fields)
  if (typeof fieldsOrError === 'string') return apiError(fieldsOrError)

  // Slug must be unique per org (among non-deleted forms).
  const existing = await adminDb
    .collection('forms')
    .where('orgId', '==', orgId)
    .where('slug', '==', slug)
    .limit(1)
    .get()
  const conflict = existing.docs.find((d) => d.data()?.deleted !== true)
  if (conflict) {
    return apiError(`Slug "${slug}" already exists in this org`, 409)
  }

  const actorRef = ctx.actor

  // Sanitize: strip undefined values so Firestore doesn't reject
  const doc: Record<string, unknown> = {
    orgId,
    name: body.name.trim(),
    slug,
    title: body.title?.trim() ?? body.name.trim(),
    description: body.description?.trim() ?? '',
    fields: fieldsOrError,
    thankYouMessage:
      body.thankYouMessage?.trim() ?? 'Thanks for your submission',
    notifyEmails: body.notifyEmails ?? [],
    redirectUrl: body.redirectUrl ?? null,
    createContact: body.createContact ?? true,
    active: body.active ?? true,
    rateLimitPerMinute: body.rateLimitPerMinute ?? 10,
    turnstileEnabled: body.turnstileEnabled === true,
    turnstileSiteKey:
      typeof body.turnstileSiteKey === 'string' ? body.turnstileSiteKey.trim() : '',
    createdByRef: actorRef,
    updatedByRef: actorRef,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deleted: false,
  }

  // Omit createdBy / updatedBy uid for agent calls
  if (!ctx.isAgent) {
    doc.createdBy = actorRef.uid
    doc.updatedBy = actorRef.uid
  }

  const docRef = await adminDb.collection('forms').add(doc)
  const created = await docRef.get()
  return apiSuccess({ id: docRef.id, ...created.data() }, 201)
})
