'use client'

import { useState } from 'react'

export function AccessCodeForm({
  editShareToken,
  onSuccess,
}: {
  editShareToken: string
  onSuccess: () => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/v1/public/client-documents/edit/${editShareToken}/verify-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.toUpperCase() }),
        },
      )
      const body = await res.json()
      if (!body.success) throw new Error(body.error ?? 'Invalid code')
      onSuccess()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto mt-32 max-w-sm space-y-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-[var(--doc-text)]">Enter access code</h1>
      <p className="text-sm text-[var(--doc-muted)]">
        Your code is in the email or message that linked you here.
      </p>
      <input
        autoFocus
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={6}
        className="w-full rounded-lg border border-[var(--doc-border)] bg-transparent px-4 py-3 text-center text-xl tracking-[0.4em] text-[var(--doc-text)] focus:border-[var(--doc-accent)] focus:outline-none"
        placeholder="XXXXXX"
        aria-label="Access code"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || code.length < 6}
        className="w-full rounded-lg bg-[var(--doc-accent)] px-6 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-40"
      >
        {busy ? 'Verifying…' : 'Continue'}
      </button>
    </form>
  )
}
