/**
 * Temporary debug endpoint — checks which social platform env vars are set.
 * DELETE THIS after debugging.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  const vars = [
    'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET',
    'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_CLIENT_ID',
    'FACEBOOK_CLIENT_ID', 'FACEBOOK_CLIENT_SECRET',
    'INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET',
    'PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET',
    'THREADS_CLIENT_ID', 'THREADS_CLIENT_SECRET',
    'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET',
    'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET',
    'MASTODON_CLIENT_ID', 'MASTODON_CLIENT_SECRET',
    'DRIBBBLE_CLIENT_ID', 'DRIBBBLE_CLIENT_SECRET',
    'NEXT_PUBLIC_APP_URL', 'VERCEL_URL', 'NODE_ENV',
  ]

  const result: Record<string, string> = {}
  for (const v of vars) {
    const val = process.env[v]
    if (!val) {
      result[v] = '❌ MISSING'
    } else if (val.startsWith('eyJ')) {
      result[v] = `⚠️ ENCRYPTED BLOB (${val.length} chars)`
    } else {
      result[v] = `✅ SET (${val.length} chars, starts: ${val.slice(0, 4)}...)`
    }
  }

  return NextResponse.json(result)
}
