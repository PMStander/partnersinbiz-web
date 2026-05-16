// app/api/v1/auth/session/route.ts
//
// PUBLIC endpoint — accepts a Firebase ID token and exchanges it for a session
// cookie. Used by two flows:
//
//   1. Google OAuth via signInWithPopup — client gets an ID token, POSTs it
//      here, we set __session.
//   2. Magic-link verify landing page — client exchanged a custom token for an
//      ID token via signInWithCustomToken, POSTs the ID token here.
//
// Mirrors the established pattern at app/api/auth/session/route.ts but lives
// under the /api/v1/* namespace so it can be called by guest-auth flows
// without going through the legacy session route. We always bootstrap a
// users/{uid} document via findOrCreateGuestUser so downstream code can rely
// on the doc existing.

import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'
import { apiError } from '@/lib/api/response'
import { findOrCreateGuestUser } from '@/lib/auth/guestUser'

export const dynamic = 'force-dynamic'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'
const EXPIRES_IN_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string }
  if (!idToken) return apiError('idToken required', 400)

  let decoded
  try {
    // checkRevoked=true so a revoked / disabled user can't ride an old token
    decoded = await adminAuth.verifyIdToken(idToken, true)
  } catch {
    return apiError('Invalid ID token', 401)
  }

  if (!decoded.email) return apiError('Token missing email', 400)

  // Bootstrap a users/{uid} doc so the rest of the platform can rely on it
  // existing. We default the provider to 'google'; magic-link flows already
  // created the doc in the verify endpoint, in which case findOrCreate is a
  // no-op + lastSeenAt update.
  const provider = (decoded.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider
  const inferredProvider = provider === 'custom' ? 'magic_link' : 'google'
  await findOrCreateGuestUser(decoded.email, inferredProvider, decoded.name)

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: EXPIRES_IN_MS,
  })

  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: COOKIE_NAME,
    value: sessionCookie,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: EXPIRES_IN_MS / 1000,
    path: '/',
  })
  return response
}
