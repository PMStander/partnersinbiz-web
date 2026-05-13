/**
 * GET /api/v1/orgs/[orgId]/contacts
 *
 * Auth: admin or client
 * Returns: users the caller may start or add to a conversation.
 *
 * Admin callers:
 *   → all org members (from organizations/{orgId}.members)
 *
 * Client callers:
 *   → org admins (if enableClientToAdminChat)
 *   → PiB platform super-admins (if enableClientToPiBTeamChat)
 *     Super-admins are users with role='admin' and no orgId field
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { orgChatConfigDoc } from '@/lib/conversations/conversations'
import { DEFAULT_CHAT_CONFIG } from '@/lib/conversations/types'
import type { Organization, OrgMember } from '@/lib/organizations/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ orgId: string }> }

interface ContactEntry {
  uid: string
  displayName?: string
  email?: string
  role: 'admin' | 'client'
  photoURL?: string
}

async function fetchUserDetails(
  uid: string,
): Promise<{ displayName?: string; email?: string; photoURL?: string }> {
  const doc = await adminDb.collection('users').doc(uid).get()
  const data = doc.data() ?? {}
  return {
    displayName: data.displayName as string | undefined,
    email: data.email as string | undefined,
    photoURL: data.photoURL as string | undefined,
  }
}

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { orgId: orgIdParam } = await (context as Params).params
    const scope = resolveOrgScope(user, orgIdParam)
    if (!scope.ok) return apiError(scope.error, scope.status)

    const callerIsAdmin = user.role === 'admin' || user.role === 'ai'

    // Read org chat config for feature flags
    const configDoc = await orgChatConfigDoc(scope.orgId).get()
    const config = configDoc.exists ? configDoc.data() : null
    const enableClientToAdminChat =
      (config?.enableClientToAdminChat as boolean | undefined) ??
      DEFAULT_CHAT_CONFIG.enableClientToAdminChat
    const enableClientToPiBTeamChat =
      (config?.enableClientToPiBTeamChat as boolean | undefined) ??
      DEFAULT_CHAT_CONFIG.enableClientToPiBTeamChat

    const contacts: ContactEntry[] = []

    if (callerIsAdmin) {
      // Admin: return all org members with their Firestore user details
      const orgDoc = await adminDb.collection('organizations').doc(scope.orgId).get()
      if (!orgDoc.exists) return apiError('Organisation not found', 404)
      const org = orgDoc.data() as Organization
      const members: OrgMember[] = org.members ?? []

      const resolved = await Promise.all(
        members.map(async (m) => {
          const details = await fetchUserDetails(m.userId)
          // Treat org member roles (owner/admin/member/viewer) as admin vs client
          const contactRole: 'admin' | 'client' =
            m.role === 'owner' || m.role === 'admin' ? 'admin' : 'client'
          return {
            uid: m.userId,
            role: contactRole,
            ...details,
          } as ContactEntry
        }),
      )
      contacts.push(...resolved)
    } else {
      // Client: conditionally include org admins and/or PiB super-admins

      if (enableClientToAdminChat) {
        // Fetch org members with admin/owner role
        const orgDoc = await adminDb.collection('organizations').doc(scope.orgId).get()
        if (orgDoc.exists) {
          const org = orgDoc.data() as Organization
          const adminMembers = (org.members ?? []).filter(
            (m) => m.role === 'owner' || m.role === 'admin',
          )
          const resolved = await Promise.all(
            adminMembers.map(async (m) => {
              const details = await fetchUserDetails(m.userId)
              return { uid: m.userId, role: 'admin' as const, ...details }
            }),
          )
          contacts.push(...resolved)
        }
      }

      if (enableClientToPiBTeamChat) {
        // PiB platform super-admins: role='admin' and no orgId field
        const superAdminSnap = await adminDb
          .collection('users')
          .where('role', '==', 'admin')
          .get()

        const platformAdmins = superAdminSnap.docs
          .filter((d) => {
            const data = d.data()
            // Super-admins have no orgId or an empty string
            const orgId = data.orgId
            return orgId === undefined || orgId === null || orgId === ''
          })
          .map((d) => {
            const data = d.data()
            return {
              uid: d.id,
              role: 'admin' as const,
              displayName: data.displayName as string | undefined,
              email: data.email as string | undefined,
              photoURL: data.photoURL as string | undefined,
            } as ContactEntry
          })

        // Deduplicate — a PiB admin may also be an org admin
        const existingUids = new Set(contacts.map((c) => c.uid))
        contacts.push(...platformAdmins.filter((a) => !existingUids.has(a.uid)))
      }
    }

    return apiSuccess(contacts)
  },
)
