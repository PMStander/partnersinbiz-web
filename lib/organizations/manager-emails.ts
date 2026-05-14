// lib/organizations/manager-emails.ts
//
// Returns email addresses of the owner/admin members of a client org — i.e.
// whoever is assigned to manage that client in the Teams tab. Used to route
// client-action notification emails to the right PiB staff instead of a
// hardcoded address.

import { adminDb, adminAuth } from '@/lib/firebase/admin'
import type { OrgMember } from './types'

export async function getOrgManagerEmails(orgId: string): Promise<string[]> {
  const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
  if (!orgDoc.exists) return []

  const members: OrgMember[] = orgDoc.data()?.members ?? []
  const managers = members.filter(m => m.role === 'owner' || m.role === 'admin')

  const emails: string[] = []
  await Promise.all(
    managers.map(async (member) => {
      const userDoc = await adminDb.collection('users').doc(member.userId).get()
      let email = userDoc.data()?.email as string | undefined

      if (!email) {
        try {
          const authUser = await adminAuth.getUser(member.userId)
          email = authUser.email ?? undefined
        } catch {
          // user may not exist in Auth
        }
      }

      if (email) emails.push(email)
    }),
  )

  return [...new Set(emails)]
}
