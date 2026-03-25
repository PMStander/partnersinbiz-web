import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!cookie) {
    return NextResponse.json({ error: 'No cookie' }, { status: 401 })
  }
  try {
    const decoded = await adminAuth.verifySessionCookie(cookie, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : 'client'
    return NextResponse.json({ uid: decoded.uid, role })
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  const { sessionCookie } = await request.json()
  if (!sessionCookie) {
    return NextResponse.json({ error: 'No cookie' }, { status: 401 })
  }
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : 'client'
    return NextResponse.json({ uid: decoded.uid, role })
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}
