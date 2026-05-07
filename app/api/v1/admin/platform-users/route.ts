/**
 * GET  /api/v1/admin/platform-users — list all platform admin users
 * POST /api/v1/admin/platform-users — create a new platform admin user
 *
 * "Platform admin" = a user with role === 'admin'. They are PiB internal
 * staff. They can be either:
 *   - super admin: no allowedOrgIds set, sees & manages every org
 *   - restricted: allowedOrgIds = [orgIds], sees only those orgs
 *
 * Only super admins can call these endpoints (otherwise a restricted admin
 * could silently elevate themselves by adding orgs to their own allowedOrgIds).
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { isSuperAdmin } from '@/lib/api/platformAdmin'
import { PIB_PLATFORM_ORG_ID } from '@/lib/platform/constants'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

export interface PlatformUserView {
  uid: string
  email: string
  displayName: string
  role: 'admin'
  orgId?: string
  allowedOrgIds: string[] // empty = super admin
  isSuperAdmin: boolean
  createdAt?: unknown
  updatedAt?: unknown
  lastSignInTime?: string | null
}

function sanitiseAllowedOrgIds(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  for (const v of input) {
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed && !out.includes(trimmed)) out.push(trimmed)
    }
  }
  return out
}

export const GET = withAuth('admin', async (req, user) => {
  if (!isSuperAdmin(user)) {
    return apiError('Only super admins can list platform users', 403)
  }

  const snap = await adminDb.collection('users').where('role', '==', 'admin').get()

  // Fetch lastSignInTime from Firebase Auth for all users in parallel
  const authResults = await Promise.allSettled(
    snap.docs.map((doc) => adminAuth.getUser(doc.id)),
  )

  const users: PlatformUserView[] = snap.docs.map((doc, i) => {
    const data = doc.data() ?? {}
    const allowedOrgIds = sanitiseAllowedOrgIds(data.allowedOrgIds)
    const authUser = authResults[i].status === 'fulfilled' ? authResults[i].value : null
    return {
      uid: doc.id,
      email: typeof data.email === 'string' ? data.email : '',
      displayName: typeof data.displayName === 'string' ? data.displayName : '',
      role: 'admin',
      orgId: typeof data.orgId === 'string' ? data.orgId : undefined,
      allowedOrgIds,
      isSuperAdmin: allowedOrgIds.length === 0,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      lastSignInTime: authUser?.metadata?.lastSignInTime ?? null,
    }
  })

  users.sort((a, b) => {
    const ats = (a.createdAt as { _seconds?: number } | undefined)?._seconds ?? 0
    const bts = (b.createdAt as { _seconds?: number } | undefined)?._seconds ?? 0
    return bts - ats
  })

  return apiSuccess(users)
})

export const POST = withAuth('admin', async (req: NextRequest, user) => {
  if (!isSuperAdmin(user)) {
    return apiError('Only super admins can create platform users', 403)
  }

  const body = await req.json().catch(() => ({}))
  const email: string = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const name: string = typeof body.name === 'string' ? body.name.trim() : ''
  const allowedOrgIds = sanitiseAllowedOrgIds(body.allowedOrgIds)
  const sendWelcome = body.sendWelcomeEmail !== false

  if (!email) return apiError('email is required', 400)
  if (!name) return apiError('name is required', 400)

  // Find or create the Firebase Auth user
  let uid: string
  try {
    const existing = await adminAuth.getUserByEmail(email)
    uid = existing.uid
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code
    if (code !== 'auth/user-not-found') throw err
    const created = await adminAuth.createUser({ email, displayName: name })
    uid = created.uid
  }

  // Refuse to overwrite a non-admin user — would silently demote them or
  // change their role unexpectedly. Force the operator to delete the
  // existing record first.
  const existingDoc = await adminDb.collection('users').doc(uid).get()
  if (existingDoc.exists) {
    const existingRole = existingDoc.data()?.role
    if (existingRole && existingRole !== 'admin') {
      return apiError(
        `A user with this email already exists as role "${existingRole}". Resolve in the team page first.`,
        409,
      )
    }
  }

  await adminDb.collection('users').doc(uid).set(
    {
      email,
      displayName: name,
      role: 'admin',
      orgId: PIB_PLATFORM_ORG_ID,
      allowedOrgIds,
      createdAt: existingDoc.exists ? existingDoc.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  // Generate password setup link
  let setupLink: string | null = null
  try {
    setupLink = await adminAuth.generatePasswordResetLink(email)
  } catch {
    // non-fatal
  }

  if (sendWelcome && setupLink) {
    try {
      await sendStaffWelcomeEmail({ to: email, name, setupLink })
    } catch (err) {
      console.error('[platform-users] welcome email failed', err)
    }
  }

  return apiSuccess(
    {
      uid,
      email,
      displayName: name,
      role: 'admin' as const,
      orgId: PIB_PLATFORM_ORG_ID,
      allowedOrgIds,
      isSuperAdmin: allowedOrgIds.length === 0,
      setupLink,
    },
    201,
  )
})

interface StaffWelcomeInput {
  to: string
  name: string
  setupLink: string
}

async function sendStaffWelcomeEmail(input: StaffWelcomeInput) {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'
  const adminUrl = `${BASE_URL}/admin/dashboard`
  const greeting = input.name?.split(' ')[0] ?? 'there'

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:0 24px;">
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
      <h1 style="font-size:20px;color:#111;margin:0 0 16px 0;">Welcome to the Partners in Biz team</h1>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 16px 0;">
        Hi ${escapeHtml(greeting)} — your Partners in Biz staff account is set up.
        Set your password below to get into the admin console.
      </p>
      <p style="text-align:center;margin:0 0 24px 0;">
        <a href="${escapeAttr(input.setupLink)}"
           style="display:inline-block;padding:12px 24px;background:#F59E0B;color:#111;text-decoration:none;font-weight:600;border-radius:8px;">
          Set password &amp; sign in
        </a>
      </p>
      <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0;">
        Or paste this link in your browser:<br>
        <a href="${escapeAttr(input.setupLink)}" style="color:#6b7280;word-break:break-all;">${escapeAttr(input.setupLink)}</a>
      </p>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px;">
      Admin console: <a href="${escapeAttr(adminUrl)}" style="color:#9ca3af;">${escapeAttr(adminUrl)}</a>
    </p>
  </div>
</body></html>`

  const text = `Hi ${greeting},

Your Partners in Biz staff account is ready.

Set your password and sign in: ${input.setupLink}

Admin console: ${adminUrl}`

  await getResendClient().emails.send({
    from: FROM_ADDRESS,
    to: input.to,
    subject: `Welcome to Partners in Biz`,
    html,
    text,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}
