// app/api/v1/capture-sources/route.ts
//
// GET  /api/v1/capture-sources?orgId=...&active=...  — list lead-capture sources
// POST /api/v1/capture-sources                        — create a lead-capture source
//
// This is the v2 "lead capture" system. It is distinct from the legacy
// /api/v1/crm/capture-sources endpoints (which use a `publicKey` and the
// `capture_sources` collection). Data lives in `lead_capture_sources`.

import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { actorFrom } from '@/lib/api/actor'
import { withIdempotency } from '@/lib/api/idempotency'
import type { ApiUser } from '@/lib/api/types'
import {
  CaptureSource,
  DEFAULT_WIDGET_THEME,
  LEAD_CAPTURE_SOURCES,
  VALID_CAPTURE_TYPES,
  VALID_FIELD_TYPES,
  type CaptureField,
  type CaptureSourceType,
  type CaptureWidgetTheme,
  type DoubleOptInMode,
} from '@/lib/lead-capture/types'

export const dynamic = 'force-dynamic'

function sanitizeFields(input: unknown): CaptureField[] {
  if (!Array.isArray(input)) return []
  return input
    .map((raw): CaptureField | null => {
      if (!raw || typeof raw !== 'object') return null
      const r = raw as Record<string, unknown>
      const key = typeof r.key === 'string' ? r.key.trim() : ''
      const label = typeof r.label === 'string' ? r.label.trim() : ''
      const type = (typeof r.type === 'string' ? r.type : 'text') as CaptureField['type']
      if (!key || !label) return null
      if (!VALID_FIELD_TYPES.includes(type)) return null
      const field: CaptureField = {
        key,
        label,
        type,
        required: r.required === true,
      }
      if (typeof r.placeholder === 'string') field.placeholder = r.placeholder
      if (Array.isArray(r.options)) {
        field.options = r.options.filter((o): o is string => typeof o === 'string')
      }
      return field
    })
    .filter((f): f is CaptureField => f !== null)
}

function sanitizeTheme(input: unknown): CaptureWidgetTheme {
  if (!input || typeof input !== 'object') return { ...DEFAULT_WIDGET_THEME }
  const r = input as Record<string, unknown>
  return {
    primaryColor: typeof r.primaryColor === 'string' ? r.primaryColor : DEFAULT_WIDGET_THEME.primaryColor,
    textColor: typeof r.textColor === 'string' ? r.textColor : DEFAULT_WIDGET_THEME.textColor,
    backgroundColor: typeof r.backgroundColor === 'string' ? r.backgroundColor : DEFAULT_WIDGET_THEME.backgroundColor,
    borderRadius: typeof r.borderRadius === 'number' ? r.borderRadius : DEFAULT_WIDGET_THEME.borderRadius,
    buttonText: typeof r.buttonText === 'string' && r.buttonText.trim() ? r.buttonText : DEFAULT_WIDGET_THEME.buttonText,
    headingText: typeof r.headingText === 'string' && r.headingText.trim() ? r.headingText : DEFAULT_WIDGET_THEME.headingText,
    subheadingText: typeof r.subheadingText === 'string' ? r.subheadingText : DEFAULT_WIDGET_THEME.subheadingText,
  }
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
}

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId
  const activeParam = searchParams.get('active')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await (adminDb.collection(LEAD_CAPTURE_SOURCES) as any)
    .where('orgId', '==', orgId)
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: CaptureSource[] = snap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }) as CaptureSource)
    .filter((s: CaptureSource) => s.deleted !== true)

  if (activeParam === 'true') data = data.filter((s) => s.active === true)
  else if (activeParam === 'false') data = data.filter((s) => s.active === false)

  data.sort((a, b) => {
    const ams = (a.createdAt as { _seconds?: number; seconds?: number } | null)?._seconds
      ?? (a.createdAt as { seconds?: number } | null)?.seconds ?? 0
    const bms = (b.createdAt as { _seconds?: number; seconds?: number } | null)?._seconds
      ?? (b.createdAt as { seconds?: number } | null)?.seconds ?? 0
    return bms - ams
  })

  const total = data.length
  data = data.slice((page - 1) * limit, page * limit)

  return apiSuccess(data, 200, { total, page, limit })
})

export const POST = withAuth(
  'client',
  withIdempotency(async (req: NextRequest, user: ApiUser) => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('Invalid JSON body', 400)

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const type = body.type as CaptureSourceType | undefined
    if (!name) return apiError('name is required', 400)
    if (!type || !VALID_CAPTURE_TYPES.includes(type)) {
      return apiError(`type must be one of: ${VALID_CAPTURE_TYPES.join(', ')}`, 400)
    }

    const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
    const scope = resolveOrgScope(user, requestedOrgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const orgId = scope.orgId

    const doubleOptIn: DoubleOptInMode = body.doubleOptIn === 'on' ? 'on' : 'off'

    const docData = {
      orgId,
      name,
      type,
      doubleOptIn,
      confirmationSubject: typeof body.confirmationSubject === 'string' ? body.confirmationSubject : '',
      confirmationBodyHtml: typeof body.confirmationBodyHtml === 'string' ? body.confirmationBodyHtml : '',
      successMessage:
        typeof body.successMessage === 'string' && body.successMessage.trim()
          ? body.successMessage
          : 'Thanks — you are subscribed!',
      successRedirectUrl: typeof body.successRedirectUrl === 'string' ? body.successRedirectUrl : '',
      fields: sanitizeFields(body.fields),
      tagsToApply: strArray(body.tagsToApply),
      campaignIdsToEnroll: strArray(body.campaignIdsToEnroll),
      sequenceIdsToEnroll: strArray(body.sequenceIdsToEnroll),
      notifyEmails: strArray(body.notifyEmails),
      widgetTheme: sanitizeTheme(body.widgetTheme),
      active: body.active === false ? false : true,
      ...actorFrom(user),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deleted: false,
    }

    const ref = await adminDb.collection(LEAD_CAPTURE_SOURCES).add(docData)
    const created = await ref.get()
    return apiSuccess({ id: ref.id, ...created.data() }, 201)
  }),
)
