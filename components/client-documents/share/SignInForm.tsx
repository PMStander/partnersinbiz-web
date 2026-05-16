'use client'

import { useState } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth, googleProvider } from '@/lib/firebase/client'

export function SignInForm({
  redirectUrl,
  context,
  docTitle,
  onAuthenticated,
}: {
  redirectUrl: string
  context?: unknown
  docTitle?: string
  onAuthenticated: () => void
}) {
  const [tab, setTab] = useState<'email' | 'google'>('email')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/auth/magic-link/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirectUrl, context, docTitle }),
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? 'Failed to send')
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function signInGoogle() {
    setBusy(true)
    setError(null)
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const idToken = await result.user.getIdToken()
      const res = await fetch('/api/v1/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? 'Sign-in failed')
      onAuthenticated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto mt-32 max-w-sm space-y-4 px-6 text-center">
        <h1 className="text-2xl font-semibold text-[var(--doc-text)]">Check your email</h1>
        <p className="text-sm text-[var(--doc-muted)]">
          We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto mt-32 max-w-sm space-y-4 px-6">
      <h1 className="text-center text-2xl font-semibold text-[var(--doc-text)]">
        Sign in to continue
      </h1>

      <div className="flex border-b border-[var(--doc-border)]">
        <button
          onClick={() => setTab('email')}
          className={`flex-1 py-2 text-sm font-medium ${
            tab === 'email'
              ? 'border-b-2 border-[var(--doc-accent)] text-[var(--doc-accent)]'
              : 'text-[var(--doc-muted)]'
          }`}
        >
          Email link
        </button>
        <button
          onClick={() => setTab('google')}
          className={`flex-1 py-2 text-sm font-medium ${
            tab === 'google'
              ? 'border-b-2 border-[var(--doc-accent)] text-[var(--doc-accent)]'
              : 'text-[var(--doc-muted)]'
          }`}
        >
          Google
        </button>
      </div>

      {tab === 'email' ? (
        <form onSubmit={sendMagicLink} className="space-y-3">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            aria-label="Email"
            className="w-full rounded-lg border border-[var(--doc-border)] bg-transparent px-4 py-3 text-[var(--doc-text)] focus:border-[var(--doc-accent)] focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !email}
            className="w-full rounded-lg bg-[var(--doc-accent)] px-6 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <button
            onClick={signInGoogle}
            disabled={busy}
            className="w-full rounded-lg border border-[var(--doc-border)] bg-white py-3 text-sm font-semibold text-black hover:bg-gray-50 disabled:opacity-40"
          >
            {busy ? 'Signing in…' : 'Continue with Google'}
          </button>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  )
}
