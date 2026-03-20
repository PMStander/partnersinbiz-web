import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'

const PROTECTED = ['/portal', '/admin']
const ADMIN_ONLY = ['/admin']

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verify session cookie via internal API to avoid importing Admin SDK in edge runtime
  const verifyResponse = await fetch(new URL('/api/auth/verify', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCookie }),
  })

  if (!verifyResponse.ok) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { role } = await verifyResponse.json()
  const isAdminOnly = ADMIN_ONLY.some((p) => pathname.startsWith(p))
  if (isAdminOnly && role !== 'admin') {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*', '/admin/:path*'],
}
