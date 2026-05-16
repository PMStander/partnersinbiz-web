// app/api/v1/portal/settings/team/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { apiError, apiErrorFromException } from '@/lib/api/response'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'

export const dynamic = 'force-dynamic'

export const POST = withPortalAuthAndRole('admin', async (req: NextRequest, _uid: string, orgId: string) => {
  try {
    const body = await req.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const role = body.role === 'admin' ? 'admin' : 'member'

    if (!email || !email.includes('@')) {
      return apiError('Valid email is required', 400)
    }

    let targetUid: string
    let isNew = false
    try {
      const existing = await adminAuth.getUserByEmail(email)
      targetUid = existing.uid
    } catch {
      const newUser = await adminAuth.createUser({ email })
      targetUid = newUser.uid
      isNew = true
    }

    const userRef = adminDb.collection('users').doc(targetUid)
    const userDoc = await userRef.get()
    if (userDoc.exists) {
      await userRef.update({
        orgIds: FieldValue.arrayUnion(orgId),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      await userRef.set({
        uid: targetUid,
        email,
        role: 'client',
        orgId,
        orgIds: [orgId],
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    await adminDb.collection('organizations').doc(orgId).update({
      members: FieldValue.arrayUnion({ userId: targetUid, role, joinedAt: FieldValue.serverTimestamp() }),
      updatedAt: FieldValue.serverTimestamp(),
    })

    await adminDb
      .collection('orgMembers')
      .doc(`${orgId}_${targetUid}`)
      .set(
        {
          orgId,
          uid: targetUid,
          firstName: '',
          lastName: '',
          jobTitle: '',
          phone: '',
          avatarUrl: '',
          role,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

    if (isNew) {
      try {
        const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'
        const firebaseLink = await adminAuth.generatePasswordResetLink(email, {
          url: `${BASE_URL}/login`,
        })
        const setupLink = `${BASE_URL}/auth/reset?link=${encodeURIComponent(firebaseLink)}`
        const resend = getResendClient()
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: email,
          subject: 'You have been invited to a workspace on Partners in Biz',
          html: `<p>You have been invited to join a workspace on Partners in Biz.</p><p><a href="${setupLink}">Set up your account →</a></p><p>This link expires after use. If you did not expect this email, you can ignore it.</p>`,
        })
      } catch {
        // Non-fatal — user can request a password reset from the login page
      }
    }

    return NextResponse.json({ uid: targetUid, isNew })
  } catch (err) {
    return apiErrorFromException(err)
  }
})
