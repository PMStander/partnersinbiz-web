// lib/calendar/types.ts
// Types for the calendar events module — meetings + events with attendees.

export type CalendarAttendeeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'tentative'

export interface CalendarAttendee {
  name: string
  email: string
  status: CalendarAttendeeStatus
  userId?: string
}

export interface CalendarRelatedTo {
  type: 'contact' | 'deal' | 'project' | 'client_org'
  id: string
}

export interface CalendarAssignee {
  type: 'user' | 'agent'
  id: string
}

export interface CalendarEvent {
  id: string
  orgId: string
  title: string
  description: string
  startAt: string // ISO
  endAt: string // ISO
  allDay: boolean
  timezone: string // IANA, default 'UTC'
  location: string
  meetingUrl: string
  attendees: CalendarAttendee[]
  relatedTo: CalendarRelatedTo | null
  assignedTo: CalendarAssignee | null
  reminderMinutesBefore: number[] // e.g. [60, 10]
  recurrence: string | null // RRULE string (parsing deferred)
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  createdAt: unknown
  updatedAt: unknown
  deleted: boolean
}

export interface CalendarEventInput {
  title: string
  description?: string
  startAt: string
  endAt: string
  allDay?: boolean
  timezone?: string
  location?: string
  meetingUrl?: string
  attendees?: CalendarAttendee[]
  relatedTo?: CalendarRelatedTo
  assignedTo?: CalendarAssignee
  reminderMinutesBefore?: number[]
  recurrence?: string
}

export const VALID_ATTENDEE_STATUSES: CalendarAttendeeStatus[] = [
  'pending',
  'accepted',
  'declined',
  'tentative',
]

export const VALID_RELATED_TO_TYPES: CalendarRelatedTo['type'][] = [
  'contact',
  'deal',
  'project',
  'client_org',
]

export const VALID_ASSIGNEE_TYPES: CalendarAssignee['type'][] = ['user', 'agent']
