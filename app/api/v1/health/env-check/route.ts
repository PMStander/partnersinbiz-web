/**
 * Temporary debug endpoint — checks env var injection.
 * DELETE THIS after debugging.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  const vars = [
    'ENV_DEBUG_TEST',
    'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET',
    'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET',
    'FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET',
    'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_FIREBASE_API_KEY',
    'VERCEL_URL', 'NODE_ENV', 'VERCEL',
    'FIREBASE_ADMIN_PROJECT_ID', 'ADMIN_EMAIL',
  ]

  const result: Record<string, string> = {}
  for (const v of vars) {
    const val = process.env[v]
    if (!val) {
      result[v] = 'MISSING'
    } else {
      result[v] = `SET:${val.length}:${val.slice(0, 6)}`
    }
  }

  // Count total env vars available
  result._totalEnvVars = String(Object.keys(process.env).length)
  // List first 20 env var NAMES (not values) that start with common prefixes
  const allKeys = Object.keys(process.env).sort()
  result._sampleKeys = allKeys.filter(k =>
    k.startsWith('NEXT_') || k.startsWith('FIREBASE') || k.startsWith('LINKEDIN') ||
    k.startsWith('TIKTOK') || k.startsWith('VERCEL') || k.startsWith('ENV_') ||
    k.startsWith('ADMIN') || k.startsWith('NODE')
  ).join(',')

  return NextResponse.json(result)
}
