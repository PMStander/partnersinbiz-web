import type { CapiActionSource, CapiCustomData } from '@/lib/ads/types'

/**
 * Raw user PII data before hashing.
 * All fields are optional strings.
 * fbp/fbc are Meta browser pixel cookies — already hashed-equivalent, pass through unchanged.
 */
export interface CapiUserRaw {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  gender?: string
  city?: string
  state?: string
  country?: string
  zip?: string
  dob?: string
  externalId?: string
  /** Meta browser pixel cookies — already hashed-equivalent, pass through. */
  fbp?: string
  fbc?: string
}

/**
 * Canonical Conversion API event input shape.
 * What `/api/v1/ads/conversions/track` accepts before hashing.
 * Fields match Meta's Conversions API spec.
 */
export interface CapiEventInput {
  event_id: string
  event_name: string
  event_time: number // unix seconds
  user: CapiUserRaw
  custom_data?: CapiCustomData
  action_source: CapiActionSource
  event_source_url?: string
  property_id?: string
  opt_out?: boolean
}
