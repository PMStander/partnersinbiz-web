import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { withPortalAuth } from '@/lib/auth/portal-middleware'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

async function resolveOrgId(uid: string): Promise<string | null> {
  const userDoc = await adminDb.collection('users').doc(uid).get()
  if (!userDoc.exists) return null
  const d = userDoc.data()!
  return (d.activeOrgId ?? d.orgId ?? null) as string | null
}

export const GET = withPortalAuth(async (_req: NextRequest, uid: string) => {
  const orgId = await resolveOrgId(uid)
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const memberDoc = await adminDb.collection('orgMembers').doc(`${orgId}_${uid}`).get()
  if (!memberDoc.exists) {
    return NextResponse.json({
      profile: { firstName: '', lastName: '', jobTitle: '', phone: '', avatarUrl: '', role: null, profileBannerDismissed: false },
    })
  }

  const d = memberDoc.data()!
  return NextResponse.json({
    profile: {
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      jobTitle: d.jobTitle ?? '',
      phone: d.phone ?? '',
      avatarUrl: d.avatarUrl ?? '',
      role: d.role ?? null,
      profileBannerDismissed: d.profileBannerDismissed ?? false,
    },
  })
})

export const PATCH = withPortalAuth(async (req: NextRequest, uid: string) => {
  const orgId = await resolveOrgId(uid)
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
  const profileBannerDismissed = body.profileBannerDismissed === true

  if (!firstName && !profileBannerDismissed) {
    return NextResponse.json({ error: 'firstName is required' }, { status: 400 })
  }

  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
  const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : ''
  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : ''

  await adminDb
    .collection('orgMembers')
    .doc(`${orgId}_${uid}`)
    .set(
      {
        orgId,
        uid,
        firstName,
        lastName,
        jobTitle,
        phone,
        avatarUrl,
        ...(profileBannerDismissed ? { profileBannerDismissed: true } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

  return NextResponse.json({ profile: { firstName, lastName, jobTitle, phone, avatarUrl } })
})
