/**
 * firebase-admin initialization for the agent-watcher daemon.
 * Mirrors lib/firebase/admin.ts in the partnersinbiz-web Next app — same env var contract.
 */
import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore, Firestore, Timestamp, FieldValue } from 'firebase-admin/firestore'

let _app: App | null = null
let _db: Firestore | null = null

function getApp(): App {
  if (_app) return _app
  const existing = getApps()
  if (existing.length > 0) {
    _app = existing[0]
    return _app
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID?.trim()
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim()
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'agent-watcher: missing required env vars FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY',
    )
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
  return _app
}

export function getDb(): Firestore {
  if (_db) return _db
  _db = getFirestore(getApp())
  return _db
}

// Eagerly-bound exports for ergonomic use across modules.
export const db: Firestore = new Proxy({} as Firestore, {
  get(_target, prop) {
    const realDb = getDb()
    const value = (realDb as unknown as Record<string | symbol, unknown>)[prop as string]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(realDb) : value
  },
})

export { Timestamp, FieldValue }
