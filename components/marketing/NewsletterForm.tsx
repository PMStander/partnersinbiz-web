'use client'

import { useState } from 'react'

type Status = 'idle' | 'submitting' | 'success' | 'error'

export default function NewsletterForm({ source }: { source?: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({ email, source: source || 'footer' }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (!res.ok || !data.ok) {
        setStatus('error')
        setError(data.error || 'Something went wrong.')
        return
      }
      setStatus('success')
      setEmail('')
    } catch {
      setStatus('error')
      setError('Network error.')
    }
  }

  if (status === 'success') {
    return (
      <p className="text-sm text-[var(--color-pib-text)]">
        <em className="not-italic text-[var(--color-pib-accent)]">You&rsquo;re in.</em>{' '}
        <span className="text-[var(--color-pib-text-muted)]">Next dispatch lands when it ships.</span>
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2" noValidate>
      <label htmlFor="footer-email" className="sr-only">Email address</label>
      <input
        id="footer-email"
        type="email"
        name="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={status === 'submitting'}
        placeholder="you@company.com"
        className="flex-1 min-w-0 bg-transparent border border-[var(--color-pib-line-strong)] rounded-full px-4 py-2 text-sm focus:outline-none focus:border-[var(--color-pib-accent)] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={status === 'submitting' || !email}
        aria-label="Subscribe"
        className="rounded-full bg-[var(--color-pib-text)] text-black px-3 py-2 text-sm font-medium hover:bg-[var(--color-pib-accent)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <span className="material-symbols-outlined text-base">
          {status === 'submitting' ? 'hourglass_empty' : 'arrow_forward'}
        </span>
      </button>
      {status === 'error' && error && (
        <p role="alert" className="absolute mt-12 text-xs text-red-400">{error}</p>
      )}
    </form>
  )
}
