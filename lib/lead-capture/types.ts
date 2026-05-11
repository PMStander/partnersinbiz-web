// lib/lead-capture/types.ts
//
// Lead capture is the "outside-in" entry point for an org's CRM:
//   - A `LeadCaptureSource` describes one capture surface (a newsletter
//     signup, a lead magnet, a contact form, an embedded widget...). It
//     owns its own fields, theming, auto-enrollment rules, and an
//     optional double-opt-in (DOI) flow.
//   - A `LeadCaptureSubmission` is one form submission against a source.
//     It always creates-or-merges into the `contacts` collection; if DOI
//     is enabled, enrollment is deferred until the confirmation link is
//     clicked.
//
// This is intentionally separate from the older `lib/crm/captureSources.ts`
// system, which is keyed by an opaque `publicKey` and has a simpler schema.
// The newer system uses the doc id as the public identifier and exposes a
// full embeddable widget. Firestore collections used:
//   - lead_capture_sources
//   - lead_capture_submissions

import type { Timestamp } from 'firebase-admin/firestore'

export type CaptureSourceType =
  | 'newsletter'
  | 'lead-magnet'
  | 'contact-form'
  | 'embed-widget'
  | 'api'

export type DoubleOptInMode = 'off' | 'on'

export type CaptureFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

export interface CaptureField {
  key: string                // e.g. "firstName", "company"
  label: string
  type: CaptureFieldType
  required: boolean
  options?: string[]         // for select
  placeholder?: string
}

export interface CaptureWidgetTheme {
  primaryColor: string
  textColor: string
  backgroundColor: string
  borderRadius: number
  buttonText: string
  headingText: string
  subheadingText: string
}

export const DEFAULT_WIDGET_THEME: CaptureWidgetTheme = {
  primaryColor: '#0f766e',
  textColor: '#111827',
  backgroundColor: '#ffffff',
  borderRadius: 12,
  buttonText: 'Subscribe',
  headingText: 'Join our newsletter',
  subheadingText: 'Get the latest updates straight to your inbox.',
}

export interface CaptureSource {
  id: string
  orgId: string
  name: string                       // human label
  type: CaptureSourceType
  doubleOptIn: DoubleOptInMode
  confirmationSubject?: string       // DOI email subject
  confirmationBodyHtml?: string      // DOI email body with {{confirmUrl}} placeholder
  successMessage: string             // shown to user after submit
  successRedirectUrl?: string        // optional redirect on success
  fields: CaptureField[]             // beyond email (which is always required)
  tagsToApply: string[]              // tags applied to created/updated contact
  campaignIdsToEnroll: string[]      // direct campaign auto-enrollment
  sequenceIdsToEnroll: string[]      // direct sequence auto-enrollment
  notifyEmails: string[]             // notify org admins of new submissions
  widgetTheme: CaptureWidgetTheme
  active: boolean
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deleted?: boolean
}

export type CaptureSourceInput = Omit<
  CaptureSource,
  'id' | 'createdAt' | 'updatedAt'
>

export interface CaptureSubmission {
  id: string
  orgId: string
  captureSourceId: string
  email: string
  data: Record<string, string>       // submitted form fields
  contactId: string                  // contact created/updated
  confirmedAt: Timestamp | null      // null until DOI confirmed (or set immediately if DOI off)
  confirmationToken: string          // HMAC for DOI link
  ipAddress: string
  userAgent: string
  referer: string
  createdAt: Timestamp | null
}

export const VALID_CAPTURE_TYPES: CaptureSourceType[] = [
  'newsletter',
  'lead-magnet',
  'contact-form',
  'embed-widget',
  'api',
]

export const VALID_FIELD_TYPES: CaptureFieldType[] = [
  'text',
  'email',
  'tel',
  'textarea',
  'select',
]

export const LEAD_CAPTURE_SOURCES = 'lead_capture_sources'
export const LEAD_CAPTURE_SUBMISSIONS = 'lead_capture_submissions'
