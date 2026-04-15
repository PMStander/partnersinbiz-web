/**
 * POST /api/v1/organizations/[id]/create-login
 *
 * Creates a Firebase Auth account for a client, stores them in Firestore with
 * role "client", adds them to the organisation as a member, and returns a
 * password-setup link the admin can forward to the client.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Organization, OrgMember } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { id } = await (ctx as Params).params

  const body = await req.json().catch(() => ({}))
  const email: string = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name: string = typeof body.name === 'string' ? body.name.trim() : ''
  const role: string = body.role ?? 'member'

  if (!email) return apiError('email is required', 400)
  if (!name) return apiError('name is required', 400)

  const validRoles = ['owner', 'admin', 'member', 'viewer']
  if (!validRoles.includes(role)) {
    return apiError(`role must be one of: ${validRoles.join(', ')}`, 400)
  }

  // Fetch organisation
  const orgDoc = await adminDb.collection('organizations').doc(id).get()
  if (!orgDoc.exists) return apiError('Organisation not found', 404)
  const org = orgDoc.data() as Organization

  // Check if Firebase Auth user already exists
  let uid: string
  try {
    const existing = await adminAuth.getUserByEmail(email)
    uid = existing.uid
    // User exists in Auth — check if already in org
    const alreadyMember = (org.members ?? []).some((m) => m.userId === uid)
    if (alreadyMember) return apiError('This user is already a member of this organisation', 409)
  } catch (err: any) {
    if (err?.code !== 'auth/user-not-found') throw err

    // Create new Firebase Auth user (no password — they'll set it via the reset link)
    const created = await adminAuth.createUser({ email, displayName: name })
    uid = created.uid

    // Store user profile in Firestore
    await adminDb.collection('users').doc(uid).set({
      email,
      displayName: name,
      role: 'client',
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  // Add to organisation members
  const newMember: OrgMember = {
    userId: uid,
    role: role as any,
    joinedAt: FieldValue.serverTimestamp() as any,
    invitedBy: user.uid,
  }
  await adminDb.collection('organizations').doc(id).update({
    members: [...(org.members ?? []), newMember],
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Generate a password-setup link (same mechanism as password reset)
  let setupLink: string | null = null
  try {
    setupLink = await adminAuth.generatePasswordResetLink(email)
  } catch {
    // Non-fatal — admin can trigger reset manually from login page
  }

  return apiSuccess({ uid, email, displayName: name, role, setupLink }, 201)
})
