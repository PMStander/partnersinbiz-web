// lib/organizations/types.ts

export type OrgRole = 'owner' | 'admin' | 'member'

export interface OrgMember {
  userId: string
  role: OrgRole
}

export interface Organization {
  id?: string
  name: string
  slug: string
  description: string
  logoUrl: string
  website: string
  createdBy: string
  members: OrgMember[]
  linkedClientId: string
  active: boolean
  createdAt?: unknown   // Firestore Timestamp (serialised as { _seconds, _nanoseconds })
  updatedAt?: unknown
}

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  description: string
  logoUrl: string
  website: string
  active: boolean
  memberCount: number
  linkedClientId: string
  createdAt?: unknown
  updatedAt?: unknown
}
