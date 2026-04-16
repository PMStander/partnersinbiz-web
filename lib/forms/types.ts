// lib/forms/types.ts
//
// Types for the forms module — public-facing, embeddable form definitions and
// their submissions. Forms live under `forms/` and submissions under
// `form_submissions/`, both scoped by `orgId`.

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'file'
  | 'hidden'

export interface FormFieldValidation {
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  pattern?: string // regex (uncompiled)
}

export interface FormField {
  id: string // unique within form
  type: FormFieldType
  label: string
  required: boolean
  placeholder?: string
  options?: string[] // for select / multiselect / radio
  validation?: FormFieldValidation
}

export interface Form {
  id: string
  orgId: string
  name: string
  slug: string // unique per org
  title: string
  description: string
  fields: FormField[]
  thankYouMessage: string
  notifyEmails: string[]
  redirectUrl: string | null
  createContact: boolean
  active: boolean
  rateLimitPerMinute: number
  // Cloudflare Turnstile CAPTCHA. When turnstileEnabled is true, the
  // public submit endpoint requires a valid `cf-turnstile-response` token
  // verified against TURNSTILE_SECRET_KEY. turnstileSiteKey is embedded on
  // the public form page widget.
  turnstileEnabled: boolean
  turnstileSiteKey: string
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  createdAt: unknown
  updatedAt: unknown
  deleted: boolean
}

export interface FormSubmission {
  id: string
  formId: string
  orgId: string
  data: Record<string, unknown> // keyed by fieldId
  submittedAt: unknown
  ipAddress: string
  userAgent: string
  status: 'new' | 'read' | 'archived'
  contactId: string | null
  source: string | null
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export type FormInput = Partial<
  Omit<
    Form,
    | 'id'
    | 'createdBy'
    | 'createdByType'
    | 'createdAt'
    | 'updatedAt'
    | 'deleted'
  >
> & {
  orgId: string
  name: string
  slug: string
  fields: FormField[]
}

export const VALID_FIELD_TYPES: FormFieldType[] = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'date',
  'file',
  'hidden',
]

export const VALID_SUBMISSION_STATUSES: FormSubmission['status'][] = [
  'new',
  'read',
  'archived',
]
