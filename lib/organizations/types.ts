// lib/organizations/types.ts

import type { Timestamp } from 'firebase-admin/firestore'

// ── Org Type & Status ─────────────────────────────────────────────────────

/**
 * platform_owner = the PIB org itself (unlocks CRM, cross-org dashboard, invoicing)
 * client         = paying client org (portal access, scoped workspace)
 * partner        = future use
 */
export type OrgType = 'platform_owner' | 'client' | 'partner'

export type OrgStatus = 'active' | 'onboarding' | 'suspended' | 'churned'

// ── Org Settings ──────────────────────────────────────────────────────────

export interface OrgSettings {
  timezone: string           // IANA timezone e.g. "America/New_York"
  currency: 'USD' | 'EUR' | 'ZAR'
  defaultApprovalRequired: boolean  // social posts need client approval by default
  notificationEmail: string
  brandColors?: {
    primary: string
    secondary: string
    accent: string
  }
}

// ── Members ───────────────────────────────────────────────────────────────

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface OrgMember {
  userId: string
  role: OrgRole
  joinedAt?: Timestamp | null
  invitedBy?: string
}

// ── Organization ──────────────────────────────────────────────────────────

export interface Organization {
  id?: string
  name: string
  slug: string
  type: OrgType
  status: OrgStatus
  description: string
  logoUrl: string
  website: string
  industry?: string
  plan?: string
  billingEmail?: string
  createdBy: string
  members: OrgMember[]
  settings?: OrgSettings

  /** @deprecated Use status field instead */
  active?: boolean

  /** @deprecated Legacy link — use orgId on related entities instead */
  linkedClientId?: string

  createdAt?: unknown   // Firestore Timestamp (serialised as { _seconds, _nanoseconds })
  updatedAt?: unknown
}

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  type: OrgType
  status: OrgStatus
  description: string
  logoUrl: string
  website: string
  industry?: string
  memberCount: number
  createdAt?: unknown
  updatedAt?: unknown
}
