// app/(portal)/portal/settings/account/page.tsx
'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { getClientAuth } from '@/lib/firebase/config'

export default function AccountSettingsPage() {
  const auth = getClientAuth()
  const user = auth.currentUser
  const email = user?.email ?? ''

  const [resetting, setResetting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handlePasswordReset() {
    if (!email || resetting) return
    setResetting(true)
    setResetError('')
    try {
      await sendPasswordResetEmail(auth, email)
      setResetSent(true)
    } catch {
      setResetError('Failed to send reset email. Try again.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-semibold mb-1">Account settings</h1>
      <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">Your login credentials — not workspace-specific.</p>

      <div className="space-y-4">
        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1">Login email</p>
          <p className="text-sm">{email || '—'}</p>
          <p className="text-xs text-[var(--color-pib-text-muted)] mt-1">Read-only. Managed by your account provider.</p>
        </div>

        <div className="bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-xl p-5">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--color-pib-text-muted)] mb-1">Password</p>
          {resetSent ? (
            <p className="text-sm text-[var(--color-pib-accent)]">Password reset email sent to {email}.</p>
          ) : (
            <>
              <button
                onClick={handlePasswordReset}
                disabled={resetting}
                className="text-sm text-[var(--color-pib-accent)] hover:underline disabled:opacity-50 transition-opacity"
              >
                {resetting ? 'Sending…' : 'Send password reset email →'}
              </button>
              {resetError && <p className="text-xs text-red-400 mt-1">{resetError}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
