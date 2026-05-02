'use client'
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { registerWithEmail } from '@/lib/firebase/auth'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const password = form.get('password') as string
    const confirm = form.get('confirm') as string
    if (password !== confirm) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }
    try {
      await registerWithEmail(form.get('email') as string, password, form.get('name') as string)
      router.push('/portal/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center px-6 md:px-10 bg-[var(--color-pib-bg)] overflow-hidden">
      <div className="absolute inset-0 pib-mesh pointer-events-none" />
      <div className="absolute inset-0 pib-grid-bg pointer-events-none opacity-40" />

      <div className="relative w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 mb-8 text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
        >
          <Image src="/pib-logo-512.png" alt="Partners in Biz" width={28} height={28} className="rounded-md object-contain" />
          <span className="font-display text-lg leading-none">Partners in Biz</span>
        </Link>

        <div className="bento-card !p-8 md:!p-10">
          <p className="eyebrow">Get started</p>
          <h1 className="font-display text-3xl md:text-4xl mt-2 mb-2">Create your account.</h1>
          <p className="text-sm text-[var(--color-pib-text-muted)] mb-8">
            Set up your client portal to track projects, reports, and messages with the team.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {[
              { name: 'name',     label: 'Full name',         type: 'text',     autoComplete: 'name' },
              { name: 'email',    label: 'Email',             type: 'email',    autoComplete: 'email' },
              { name: 'password', label: 'Password',          type: 'password', autoComplete: 'new-password' },
              { name: 'confirm',  label: 'Confirm password',  type: 'password', autoComplete: 'new-password' },
            ].map(({ name, label, type, autoComplete }) => (
              <div key={name} className="flex flex-col gap-2">
                <label className="pib-label">{label}</label>
                <input name={name} type={type} required autoComplete={autoComplete} className="pib-input" />
              </div>
            ))}
            {error && (
              <p className="text-sm text-[#FCA5A5] bg-[#FCA5A5]/10 border border-[#FCA5A5]/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="btn-pib-accent justify-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account…' : 'Create account'}
              {!loading && <span className="material-symbols-outlined text-base">arrow_forward</span>}
            </button>
          </form>

          <p className="text-xs text-[var(--color-pib-text-muted)] mt-8 text-center">
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--color-pib-accent-hover)] hover:text-[var(--color-pib-accent)] transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
