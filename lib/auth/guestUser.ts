import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

export type GuestAuthProvider = 'magic_link' | 'google'

export interface GuestUser {
  uid: string
  email: string
  displayName?: string
}

export async function findOrCreateGuestUser(
  email: string,
  provider: GuestAuthProvider,
  displayName?: string,
): Promise<GuestUser> {
  const normalizedEmail = email.toLowerCase()

  let firebaseUser
  try {
    firebaseUser = await adminAuth.getUserByEmail(normalizedEmail)
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'auth/user-not-found') {
      firebaseUser = await adminAuth.createUser({
        email: normalizedEmail,
        emailVerified: true,
        displayName,
      })
    } else {
      throw err
    }
  }

  const userDocRef = adminDb.collection('users').doc(firebaseUser.uid)
  const userDoc = await userDocRef.get()
  if (!userDoc.exists) {
    await userDocRef.set({
      uid: firebaseUser.uid,
      email: normalizedEmail,
      displayName: displayName ?? firebaseUser.displayName ?? null,
      role: 'guest',
      provider,
      createdAt: FieldValue.serverTimestamp(),
      lastSeenAt: FieldValue.serverTimestamp(),
    })
  } else {
    await userDocRef.set({ lastSeenAt: FieldValue.serverTimestamp() }, { merge: true })
  }

  return {
    uid: firebaseUser.uid,
    email: normalizedEmail,
    displayName: displayName ?? firebaseUser.displayName ?? undefined,
  }
}
