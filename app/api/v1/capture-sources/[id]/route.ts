// app/api/v1/capture-sources/[id]/route.ts
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'
import {
  CaptureSource,
  DEFAULT_WIDGET_THEME,
  LEAD_CAPTURE_SOURCES,
  VALID_CAPTURE_TYPES,
  VALID_FIELD_TYPES,
  type CaptureField,
  type CaptureWidgetTheme,
  type DoubleOptInMode,
} from '@/lib/lead-capture/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

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

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data() as CaptureSource
  const scope = resolveOrgScope(user, data.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  return apiSuccess({ ...data, id: snap.id })
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const existing = snap.data() as CaptureSource
  const scope = resolveOrgScope(user, existing.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return apiError('Invalid JSON body', 400)

  const patch: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.type === 'string') {
    if (!VALID_CAPTURE_TYPES.includes(body.type)) {
      return apiError(`type must be one of: ${VALID_CAPTURE_TYPES.join(', ')}`, 400)
    }
    patch.type = body.type
  }
  if (body.doubleOptIn === 'on' || body.doubleOptIn === 'off') {
    patch.doubleOptIn = body.doubleOptIn as DoubleOptInMode
  }
  if (typeof body.confirmationSubject === 'string') patch.confirmationSubject = body.confirmationSubject
  if (typeof body.confirmationBodyHtml === 'string') patch.confirmationBodyHtml = body.confirmationBodyHtml
  if (typeof body.successMessage === 'string') patch.successMessage = body.successMessage
  if (typeof body.successRedirectUrl === 'string') patch.successRedirectUrl = body.successRedirectUrl
  if (body.fields !== undefined) patch.fields = sanitizeFields(body.fields)
  if (body.tagsToApply !== undefined) patch.tagsToApply = strArray(body.tagsToApply)
  if (body.campaignIdsToEnroll !== undefined) patch.campaignIdsToEnroll = strArray(body.campaignIdsToEnroll)
  if (body.sequenceIdsToEnroll !== undefined) patch.sequenceIdsToEnroll = strArray(body.sequenceIdsToEnroll)
  if (body.notifyEmails !== undefined) patch.notifyEmails = strArray(body.notifyEmails)
  if (body.widgetTheme !== undefined) patch.widgetTheme = sanitizeTheme(body.widgetTheme)
  if (typeof body.active === 'boolean') patch.active = body.active

  await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).update({
    ...patch,
    ...lastActorFrom(user),
  })

  const updated = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  return apiSuccess({ id, ...updated.data() })
})

export const DELETE = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const existing = snap.data() as CaptureSource
  const scope = resolveOrgScope(user, existing.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).update({
    deleted: true,
    active: false,
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, deleted: true })
})
