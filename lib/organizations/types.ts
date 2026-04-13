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

// ── Brand Profile ─────────────────────────────────────────────────────────

export interface BrandProfile {
  logoUrl?: string          // URL to logo (stored externally or Firebase Storage)
  logoMarkUrl?: string      // URL to icon/mark variant
  tagline?: string          // e.g. "Build faster, grow smarter"
  toneOfVoice?: string      // e.g. "Professional but approachable, avoid jargon"
  targetAudience?: string   // e.g. "SMB founders in tech"
  doWords?: string[]        // Words/phrases to use: ["innovative", "partner"]
  dontWords?: string[]      // Words/phrases to avoid: ["cheap", "basic"]
  fonts?: {
    heading?: string        // e.g. "Inter"
    body?: string           // e.g. "DM Sans"
  }
  socialHandles?: Record<string, string>  // { twitter: "@handle", linkedin: "company/slug" }
  guidelines?: string       // Free-form markdown for additional brand notes
}

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
  brandProfile?: BrandProfile

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
