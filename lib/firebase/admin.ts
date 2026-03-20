import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getAuth, Auth } from 'firebase-admin/auth'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp())
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}

// Lazy singleton accessors — only instantiated when first called (not at build time)
export const adminAuth = new Proxy({} as Auth, {
  get(_target, prop) {
    return getAdminAuth()[prop as keyof Auth]
  },
})

export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    return getAdminDb()[prop as keyof Firestore]
  },
})
