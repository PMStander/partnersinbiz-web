// lib/auth/middleware.ts
import { NextRequest, NextResponse } from 'next/server'

type Role = 'admin' | 'user' | 'public'
type Handler = (req: NextRequest, ...args: any[]) => Promise<NextResponse>

export function withAuth(role: Role, handler: Handler): Handler {
  return async (req: NextRequest, ...args: any[]) => {
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || token !== process.env.AI_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return handler(req, ...args)
  }
}
