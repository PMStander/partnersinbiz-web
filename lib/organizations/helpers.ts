// lib/organizations/helpers.ts
import type { OrgMember, OrgRole } from './types'

/** Convert a display name to a URL-friendly slug */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Check whether userId is a member of the org */
export function isMember(members: OrgMember[], userId: string): boolean {
  return members.some((m) => m.userId === userId)
}

/** Check whether userId is owner or admin of the org */
export function isOwnerOrAdmin(members: OrgMember[], userId: string): boolean {
  return members.some(
    (m) => m.userId === userId && (m.role === 'owner' || m.role === 'admin'),
  )
}

/** Check whether userId is owner of the org */
export function isOwner(members: OrgMember[], userId: string): boolean {
  return members.some((m) => m.userId === userId && m.role === 'owner')
}

export const VALID_ROLES: OrgRole[] = ['owner', 'admin', 'member']
