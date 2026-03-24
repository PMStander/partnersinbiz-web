import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { apiError } from './response'
import type { ApiRole, ApiUser } from './types'

type RouteHandler = (req: NextRequest, user: ApiUser) => Promise<NextResponse>

/**
 * Wraps an API route handler with authentication and role enforcement.
 *
 * Auth methods accepted (in order):
 *  1. Authorization: Bearer <AI_API_KEY>  — long-lived key for agent/Claude access
 *  2. Authorization: Bearer <firebaseIdToken> — client SDK token
 *  3. Session cookie __session — set after browser login
 *
 * Role hierarchy: ai/admin satisfy any role; client only satisfies "client"
 */
export function withAuth(requiredRole: 'admin' | 'client', handler: RouteHandler) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const user = await resolveUser(req)
      if (!user) return apiError('Unauthorized', 401)

      // ai and admin satisfy any role; client only satisfies "client"
      const roleOk =
        user.role === 'ai' ||
        user.role === 'admin' ||
        (requiredRole === 'client' && user.role === 'client')

      if (!roleOk) return apiError('Forbidden', 403)

      return handler(req, user)
    } catch {
      return apiError('Unauthorized', 401)
    }
  }
}

async function resolveUser(req: NextRequest): Promise<ApiUser | null> {
  const authHeader = req.headers.get('authorization') ?? ''

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)

    // 1. Check for AI_API_KEY
    const aiKey = process.env.AI_API_KEY
    if (aiKey && token === aiKey) {
      return { uid: 'ai-agent', role: 'ai' }
    }

    // 2. Verify as Firebase ID token
    try {
      const decoded = await adminAuth.verifyIdToken(token)
      const role = await getRoleFromFirestore(decoded.uid)
      return { uid: decoded.uid, role }
    } catch {
      // fall through to cookie check
    }
  }

  // 3. Session cookie
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const cookie = req.cookies.get(cookieName)?.value
  if (cookie) {
    try {
      const decoded = await adminAuth.verifySessionCookie(cookie, true)
      const role = await getRoleFromFirestore(decoded.uid)
      return { uid: decoded.uid, role }
    } catch {
      return null
    }
  }

  return null
}

async function getRoleFromFirestore(uid: string): Promise<ApiRole> {
  const doc = await adminDb.collection('users').doc(uid).get()
  if (!doc.exists) return 'client'
  const role = doc.data()?.role
  if (role === 'admin' || role === 'client' || role === 'ai') return role
  return 'client'
}
