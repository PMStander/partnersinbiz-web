/**
 * GET    /api/v1/calendar/events/:id — fetch a single event
 * PUT    /api/v1/calendar/events/:id — update event fields (validates time ordering)
 * DELETE /api/v1/calendar/events/:id — soft delete (?force=true hard-deletes)
 *
 * Auth: admin (AI/admin)
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_ATTENDEE_STATUSES,
  VALID_RELATED_TO_TYPES,
  VALID_ASSIGNEE_TYPES,
  type CalendarAssignee,
  type CalendarAttendee,
  type CalendarEvent,
  type CalendarRelatedTo,
} from '@/lib/calendar/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

const UPDATABLE_FIELDS = [
  'title',
  'description',
  'startAt',
  'endAt',
  'allDay',
  'timezone',
  'location',
  'meetingUrl',
  'attendees',
  'relatedTo',
  'assignedTo',
  'reminderMinutesBefore',
  'recurrence',
] as const

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params
  const doc = await adminDb.collection('calendar_events').doc(id).get()
  if (!doc.exists) return apiError('Event not found', 404)
  const data = doc.data() as CalendarEvent | undefined
  if (!data || data.deleted === true) return apiError('Event not found', 404)
  return apiSuccess({ ...data, id: doc.id })
})

export const PUT = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('calendar_events').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Event not found', 404)
  const existing = doc.data() as CalendarEvent | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Event not found', 404)
  }

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  if (!body) return apiError('Invalid JSON body')

  // Attendee validation
  if (body.attendees !== undefined) {
    if (!Array.isArray(body.attendees)) {
      return apiError('attendees must be an array')
    }
    for (const raw of body.attendees) {
      if (!raw || typeof raw !== 'object') {
        return apiError('Each attendee must be an object')
      }
      const a = raw as Partial<CalendarAttendee>
      if (!a.email || typeof a.email !== 'string') {
        return apiError('Each attendee requires an email')
      }
      if (a.status && !VALID_ATTENDEE_STATUSES.includes(a.status)) {
        return apiError(
          'Invalid attendee status; expected pending | accepted | declined | tentative',
        )
      }
    }
  }

  if (body.relatedTo !== undefined && body.relatedTo !== null) {
    const r = body.relatedTo as Partial<CalendarRelatedTo>
    if (
      !r ||
      !r.type ||
      !VALID_RELATED_TO_TYPES.includes(r.type as CalendarRelatedTo['type']) ||
      !r.id
    ) {
      return apiError(
        "Invalid relatedTo; expected { type: 'contact'|'deal'|'project'|'client_org', id }",
      )
    }
  }

  if (body.assignedTo !== undefined && body.assignedTo !== null) {
    const a = body.assignedTo as Partial<CalendarAssignee>
    if (
      !a ||
      !a.type ||
      !VALID_ASSIGNEE_TYPES.includes(a.type as CalendarAssignee['type']) ||
      !a.id
    ) {
      return apiError("Invalid assignedTo; expected { type: 'user'|'agent', id }")
    }
  }

  // Re-validate start < end if either moved.
  const nextStart =
    body.startAt !== undefined ? (body.startAt as string) : existing.startAt
  const nextEnd =
    body.endAt !== undefined ? (body.endAt as string) : existing.endAt
  if (body.startAt !== undefined || body.endAt !== undefined) {
    if (!nextStart || !nextEnd) {
      return apiError('startAt and endAt are required')
    }
    if (nextStart >= nextEnd) {
      return apiError('startAt must be earlier than endAt')
    }
  }

  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  await ref.update({
    ...updates,
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, ...updates })
})

export const DELETE = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('calendar_events').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Event not found', 404)

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  if (force) {
    await ref.delete()
  } else {
    await ref.update({
      deleted: true,
      ...lastActorFrom(user),
    })
  }

  return apiSuccess({ id, deleted: true })
})
