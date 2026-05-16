'use client'

// Landing page that completes the magic-link sign-in dance.
//
// Lands here from `/api/v1/auth/magic-link/verify` with `?customToken=X&redirect=Y`.
//
// Flow (browser side):
//   1. signInWithCustomToken(auth, customToken) → Firebase user
//   2. user.getIdToken() → ID token
//   3. POST { idToken } → /api/v1/auth/session  (sets the __session cookie)
//   4. location.replace(redirect ?? '/')
//
// Why this two-step dance: adminAuth.createSessionCookie requires a real signed-in
// ID token (from a client that has authenticated to Firebase). Custom tokens
// alone don't qualify, so the browser has to exchange custom → id before the
// server can mint the session cookie. See the API route docstring at
// app/api/v1/auth/magic-link/verify/route.ts.

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signInWithCustomToken } from 'firebase/auth'
import { auth } from '@/lib/firebase/client'

export default function MagicLinkVerifyLandingPage() {
  const searchParams = useSearchParams()
  const customToken = searchParams.get('customToken')
  const redirect = searchParams.get('redirect') || '/'

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!customToken) return

    let cancelled = false
    async function run() {
      try {
        const cred = await signInWithCustomToken(auth, customToken as string)
        const idToken = await cred.user.getIdToken()
        const res = await fetch('/api/v1/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok || !body?.success) {
          throw new Error(body?.error ?? 'Sign-in failed')
        }
        if (!cancelled) {
          window.location.replace(redirect)
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [customToken, redirect])

  if (!customToken) {
    return (
      <div className="mx-auto mt-32 max-w-sm px-6 text-center text-[var(--doc-text)]">
        <h1 className="text-2xl font-semibold">No sign-in token</h1>
        <p className="mt-4 text-sm text-[var(--doc-muted)]">
          This link is missing a token. Please use the link from your email.
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto mt-32 max-w-sm px-6 text-center text-[var(--doc-text)]">
        <h1 className="text-2xl font-semibold">Sign-in failed</h1>
        <p className="mt-4 text-sm text-[var(--doc-muted)]">{error}</p>
        <p className="mt-2 text-xs text-[var(--doc-muted)]">
          The link may have expired. Request a new one from the document.
        </p>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center text-[var(--doc-muted)]">
      Signing you in…
    </div>
  )
}
