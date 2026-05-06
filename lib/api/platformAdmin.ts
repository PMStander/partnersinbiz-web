// lib/api/platformAdmin.ts
//
// Helpers for the "platform admin" concept — internal PiB staff who can
// manage one or more client organisations.
//
// A user is a "super admin" when role === 'admin' AND allowedOrgIds is
// missing/empty. Super admins have unrestricted access (current behaviour
// of every existing admin in the system) and are the only ones who can
// create / edit / delete other platform admins.

import type { ApiUser } from './types'

export function isSuperAdmin(user: ApiUser | null | undefined): boolean {
  if (!user) return false
  if (user.role === 'ai') return true
  if (user.role !== 'admin') return false
  const allowed = user.allowedOrgIds
  return !Array.isArray(allowed) || allowed.length === 0
}

export function isRestrictedAdmin(user: ApiUser | null | undefined): boolean {
  if (!user) return false
  if (user.role !== 'admin') return false
  const allowed = user.allowedOrgIds
  return Array.isArray(allowed) && allowed.length > 0
}
