import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  Auth,
} from 'firebase/auth'
import { getFirestore, Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

function getApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
}

let persistenceConfigured = false

export function getClientAuth(): Auth {
  const auth = getAuth(getApp())
  // Keep the user signed in across PWA close / reopen. Try IndexedDB first
  // (works inside installed PWAs and private windows on most browsers), then
  // fall back to localStorage, then to session-only as a last resort.
  if (!persistenceConfigured && typeof window !== 'undefined') {
    persistenceConfigured = true
    setPersistence(auth, indexedDBLocalPersistence)
      .catch(() => setPersistence(auth, browserLocalPersistence))
      .catch(() => setPersistence(auth, browserSessionPersistence))
      .catch(() => {})
  }
  return auth
}

export function getClientDb(): Firestore {
  return getFirestore(getApp())
}

// Legacy named exports for backwards compatibility — initialised lazily via Proxy
export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    return Reflect.get(getClientAuth(), prop)
  },
})

export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    return Reflect.get(getClientDb(), prop)
  },
})

// Shared Google sign-in provider used by the document edit-share flow and any
// future Google OAuth surfaces. Lives at module scope so a single instance is
// reused across components.
export const googleProvider = new GoogleAuthProvider()
