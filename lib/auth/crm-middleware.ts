import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { ROLE_RANK } from '@/lib/orgMembers/types'
import type { OrgRole } from '@/lib/organizations/types'
import {
  AGENT_PIP_REF,
  buildHumanRef,
  type MemberRef,
} from '@/lib/orgMembers/memberRef'

export type CrmRole = OrgRole | 'system'

const SYSTEM_RANK = 5
function rankOf(role: CrmRole): number {
  return role === 'system' ? SYSTEM_RANK : ROLE_RANK[role]
}

export interface OrgPermissions {
  membersCanDeleteContacts?: boolean
  membersCanExportContacts?: boolean
}

export interface CrmAuthContext {
  orgId: string
  actor: MemberRef
  role: CrmRole
  isAgent: boolean
  permissions: OrgPermissions
}

export type CrmRouteHandler = (req: NextRequest, ctx: CrmAuthContext) => Promise<Response>

function apiError(message: string, status: number): Response {
  return NextResponse.json({ success: false, error: message }, { status })
}

async function loadOrgPermissions(orgId: string): Promise<{
  permissions: OrgPermissions
  members: Array<{ userId: string; role: OrgRole }> | null
}> {
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  if (!orgDoc.exists) return { permissions: {}, members: null }
  const data = orgDoc.data() ?? {}
  return {
    permissions:
      ((data.settings as Record<string, unknown> | undefined)?.permissions as OrgPermissions) ?? {},
    members: (data.members as Array<{ userId: string; role: OrgRole }> | undefined) ?? null,
  }
}

export function withCrmAuth(
  minRole: Exclude<CrmRole, 'system'>,
  handler: CrmRouteHandler,
) {
  return async (req: NextRequest, ..._rest: unknown[]): Promise<Response> => {
    const authHeader = req.headers.get('authorization') ?? ''

    // Bearer path
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const aiKey = process.env.AI_API_KEY
      if (!aiKey || token !== aiKey) {
        return apiError('Invalid API key', 401)
      }
      const orgId = req.headers.get('x-org-id') ?? ''
      if (!orgId) {
        return apiError('Missing X-Org-Id header', 400)
      }
      const { permissions } = await loadOrgPermissions(orgId)
      const ctx: CrmAuthContext = {
        orgId,
        actor: AGENT_PIP_REF,
        role: 'system',
        isAgent: true,
        permissions,
      }
      return handler(req, ctx)
    }

    // Cookie path
    const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
    const cookie = req.cookies.get(cookieName)?.value
    if (!cookie) return apiError('Unauthorized', 401)

    let uid: string
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie)
      uid = decoded.uid
    } catch {
      return apiError('Invalid session', 401)
    }

    const userDoc = await adminDb.collection('users').doc(uid).get()
    if (!userDoc.exists) return apiError('User not found', 404)
    const userData = userDoc.data() ?? {}
    const orgId: string =
      ((userData.activeOrgId as string | undefined) ??
        (userData.orgId as string | undefined) ??
        '') as string
    if (!orgId) return apiError('No active workspace', 400)

    const memberSnap = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
    let role: OrgRole | null = null
    let actor: MemberRef | null = null
    if (memberSnap.exists) {
      const m = memberSnap.data() ?? {}
      role = (m.role as OrgRole) ?? null
      actor = buildHumanRef(uid, m)
    }

    const { permissions, members } = await loadOrgPermissions(orgId)

    if (!role) {
      const fallback = members?.find((m) => m.userId === uid)
      if (fallback) {
        role = fallback.role
        actor = { uid, displayName: uid, kind: 'human' }
      }
    }

    if (!role || !actor) return apiError('Workspace membership not found', 403)
    if (rankOf(role) < rankOf(minRole)) return apiError('Insufficient permissions', 403)

    const ctx: CrmAuthContext = { orgId, actor, role, isAgent: false, permissions }
    return handler(req, ctx)
  }
}
