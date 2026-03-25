// lib/auth/portal-middleware.ts
import { NextRequest } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'
import { apiError } from '@/lib/api/response'

type PortalHandler = (req: NextRequest, uid: string, ...args: any[]) => Promise<Response>

export function withPortalAuth(handler: PortalHandler) {
  return async (req: NextRequest, ...args: any[]): Promise<Response> => {
    const sessionCookie = req.cookies.get('__session')?.value
    if (!sessionCookie) return apiError('Unauthorized', 401)
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
      return handler(req, decoded.uid, ...args)
    } catch {
      return apiError('Unauthorized', 401)
    }
  }
}
