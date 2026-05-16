// app/api/v1/portal/settings/team/invite/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { adminDb, adminAuth } from '@/lib/firebase/admin'
import { apiError, apiErrorFromException } from '@/lib/api/response'

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
      await adminAuth.generatePasswordResetLink(email).catch(() => {})
    }

    return NextResponse.json({ uid: targetUid, isNew })
  } catch (err) {
    return apiErrorFromException(err)
  }
})
