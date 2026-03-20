import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'
const EXPIRY_DAYS = parseInt(process.env.SESSION_EXPIRY_DAYS ?? '14')
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const { idToken } = await request.json()
  if (!idToken) {
    return NextResponse.json({ error: 'idToken required' }, { status: 400 })
  }
  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRY_MS })
    const response = NextResponse.json({ status: 'ok' })
    response.cookies.set(COOKIE_NAME, sessionCookie, {
      maxAge: EXPIRY_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: 'ok' })
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return response
}
