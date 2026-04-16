/**
 * GET  /api/v1/crm/contacts  — list contacts (filterable, paginated)
 * POST /api/v1/crm/contacts  — create a new contact
 *
 * Query params (GET): stage, type, source, search, limit (default 50), page (default 1)
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type {
  Contact,
  ContactInput,
  ContactStage,
  ContactType,
  ContactSource,
} from '@/lib/crm/types'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

const VALID_STAGES: ContactStage[] = [
  'new', 'contacted', 'replied', 'demo', 'proposal', 'won', 'lost',
]
const VALID_TYPES: ContactType[] = ['lead', 'prospect', 'client', 'churned']
const VALID_SOURCES: ContactSource[] = ['manual', 'form', 'import', 'outreach']

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)
  const stage = searchParams.get('stage') as ContactStage | null
  const type = searchParams.get('type') as ContactType | null
  const source = searchParams.get('source') as ContactSource | null
  const tagsParam = searchParams.get('tags') ?? ''
  const search = searchParams.get('search') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  const tagList = tagsParam
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  if (tagList.length > 10) {
    return apiError('tags filter supports up to 10 values (array-contains-any limit)', 400)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('contacts').orderBy('createdAt', 'desc')

  if (stage && VALID_STAGES.includes(stage)) {
    query = query.where('stage', '==', stage)
  }
  if (type && VALID_TYPES.includes(type)) {
    query = query.where('type', '==', type)
  }
  if (source && VALID_SOURCES.includes(source)) {
    query = query.where('source', '==', source)
  }
  if (tagList.length > 0) {
    query = query.where('tags', 'array-contains-any', tagList)
  }

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  let contacts: Contact[] = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((c: Contact) => c.deleted !== true)

  if (search) {
    const q = search.toLowerCase()
    contacts = contacts.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.company?.toLowerCase().includes(q),
    )
  }

  return apiSuccess(contacts, 200, { total: contacts.length, page, limit })
})

export const POST = withAuth('admin', async (req) => {
  const body = await req.json() as ContactInput

  if (!body.name?.trim()) return apiError('Name is required')
  if (!body.email?.trim()) return apiError('Email is required')
  if (!isValidEmail(body.email)) return apiError('Email is invalid')
  if (body.stage && !VALID_STAGES.includes(body.stage)) return apiError('Invalid stage')
  if (body.type && !VALID_TYPES.includes(body.type)) return apiError('Invalid type')
  if (body.source && !VALID_SOURCES.includes(body.source)) return apiError('Invalid source')

  const orgId = typeof (body as { orgId?: unknown }).orgId === 'string'
    ? ((body as { orgId?: string }).orgId as string).trim()
    : ''
  if (!orgId) return apiError('orgId is required — contacts must belong to an organisation so webhooks and org-scoped reports work', 400)

  const docRef = await adminDb.collection('contacts').add({
    orgId,
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() ?? '',
    company: body.company?.trim() ?? '',
    website: body.website?.trim() ?? '',
    source: body.source ?? 'manual',
    type: body.type ?? 'lead',
    stage: body.stage ?? 'new',
    tags: body.tags ?? [],
    notes: body.notes?.trim() ?? '',
    assignedTo: body.assignedTo ?? '',
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastContactedAt: null,
  })

  try {
    await dispatchWebhook(orgId, 'contact.created', {
      id: docRef.id,
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() ?? '',
      company: body.company?.trim() ?? '',
      source: body.source ?? 'manual',
    })
  } catch (err) {
    console.error('[webhook-dispatch-error] contact.created', err)
  }

  return apiSuccess({ id: docRef.id }, 201)
})
