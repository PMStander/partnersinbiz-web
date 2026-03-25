import { NextResponse } from 'next/server'

export async function GET() {
  const cookieName = process.env.SESSION_COOKIE_NAME ?? '__session'
  const response = NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'))
  response.cookies.set(cookieName, '', { maxAge: 0, path: '/' })
  return response
}
