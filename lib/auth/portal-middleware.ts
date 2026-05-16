// lib/auth/portal-middleware.ts
import { NextRequest } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { apiError } from '@/lib/api/response'
import type { OrgRole } from '@/lib/organizations/types'
import { ROLE_RANK } from '@/lib/orgMembers/types'

type PortalHandler = (req: NextRequest, uid: string, ...args: any[]) => Promise<Response>

export function withPortalAuth(handler: PortalHandler) {
  return async (req: NextRequest, ...args: any[]): Promise<Response> => {
    const sessionCookie = req.cookies.get('__session')?.value
    if (!sessionCookie) return apiError('Unauthorized', 401)
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
      return handler(req, decoded.uid, ...args)
    } catch {
      return apiError('Unauthorized', 401)
    }
  }
}

type PortalRoleHandler = (
  req: NextRequest,
  uid: string,
  orgId: string,
  role: OrgRole
) => Promise<Response>

export function withPortalAuthAndRole(minRole: OrgRole, handler: PortalRoleHandler) {
  return withPortalAuth(async (req: NextRequest, uid: string) => {
    const userDoc = await adminDb.collection('users').doc(uid).get()
    if (!userDoc.exists) return apiError('User not found', 404)
    const userData = userDoc.data()!
    const orgId: string = (userData.activeOrgId ?? userData.orgId ?? '') as string
    if (!orgId) return apiError('No active workspace', 400)

    let role: OrgRole | null = null
    const memberDoc = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
    if (memberDoc.exists) {
      role = memberDoc.data()!.role as OrgRole
    } else {
      const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
      if (orgDoc.exists) {
        const members: Array<{ userId: string; role: OrgRole }> = orgDoc.data()!.members ?? []
        const m = members.find((m) => m.userId === uid)
        if (m) role = m.role
      }
    }

    if (!role) return apiError('Workspace membership not found', 403)
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) return apiError('Insufficient permissions', 403)

    return handler(req, uid, orgId, role)
  })
}
