/**
 * /api/v1/firebase-config — return the public Firebase web config.
 *
 * Used by `firebase-messaging-sw.js` so we don't have to hardcode keys into
 * the service worker file. Everything returned here is already shipped to the
 * browser via NEXT_PUBLIC_* envs, so this endpoint adds no new sensitivity —
 * but it centralises the values and keeps the SW cache-friendly.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-static'
export const revalidate = 3600

export async function GET() {
  return NextResponse.json(
    {
      success: true,
      data: {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
      },
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    },
  )
}
