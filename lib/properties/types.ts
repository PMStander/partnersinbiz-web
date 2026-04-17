// lib/properties/types.ts

export type PropertyType = 'web' | 'ios' | 'android' | 'universal'
export type PropertyStatus = 'draft' | 'active' | 'paused' | 'archived'

export const VALID_PROPERTY_TYPES: PropertyType[] = ['web', 'ios', 'android', 'universal']
export const VALID_PROPERTY_STATUSES: PropertyStatus[] = ['draft', 'active', 'paused', 'archived']

export interface PropertyConfig {
  appStoreUrl?: string
  playStoreUrl?: string
  primaryCtaUrl?: string
  siteUrl?: string
  killSwitch?: boolean
  featureFlags?: Record<string, boolean | string>
  customConfig?: Record<string, unknown>
}

export interface Property {
  id: string
  orgId: string
  name: string
  domain: string
  type: PropertyType
  status: PropertyStatus
  config: PropertyConfig
  conversionSequenceId?: string
  emailSenderDomain?: string
  creatorLinkPrefix?: string
  ingestKey: string
  ingestKeyRotatedAt: unknown // Firestore Timestamp — serialised as { _seconds, _nanoseconds }
  createdAt: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
  updatedAt: unknown
  updatedBy?: string
  updatedByType?: 'user' | 'agent' | 'system'
  deleted?: boolean
}

export interface CreatePropertyInput {
  orgId: string
  name: string
  domain: string
  type: PropertyType
  status?: PropertyStatus
  config?: PropertyConfig
  conversionSequenceId?: string
  emailSenderDomain?: string
  creatorLinkPrefix?: string
}

export interface UpdatePropertyInput {
  name?: string
  domain?: string
  type?: PropertyType
  status?: PropertyStatus
  config?: PropertyConfig
  conversionSequenceId?: string
  emailSenderDomain?: string
  creatorLinkPrefix?: string
}
