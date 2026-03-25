'use client'
export const dynamic = 'force-dynamic'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginWithEmail, resetPassword } from '@/lib/firebase/auth'

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
      <line x1="2" x2="22" y1="2" y2="22"/>
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Forgot password state
  const [showReset, setShowReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [resetError, setResetError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      await loginWithEmail(form.get('email') as string, form.get('password') as string)
      router.push('/portal/dashboard')
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setResetStatus('loading')
    setResetError('')
    try {
      await resetPassword(resetEmail)
      setResetStatus('sent')
    } catch {
      setResetError('Could not send reset email. Check the address and try again.')
      setResetStatus('error')
    }
  }

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center px-8 pt-20">
      <div className="glass-card p-10 w-full max-w-md">
        <h1 className="font-headline text-3xl font-bold tracking-tighter mb-8">Sign In</h1>

        {!showReset ? (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email</label>
                <input name="email" type="email" required
                  className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors" />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Password</label>
                  <button
                    type="button"
                    onClick={() => setShowReset(true)}
                    className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="w-full bg-transparent border-0 border-b border-white/20 py-3 pr-10 text-white font-body focus:border-white focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="bg-white text-black px-8 py-4 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all disabled:opacity-50 mt-2">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
            <p className="text-white/40 text-sm mt-6 text-center">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-white hover:underline">Register</Link>
            </p>
          </>
        ) : (
          <>
            <p className="text-white/60 text-sm mb-6">
              Enter your email and we&apos;ll send you a link to reset your password.
            </p>
            {resetStatus === 'sent' ? (
              <div className="flex flex-col gap-6">
                <p className="text-green-400 text-sm">Reset email sent — check your inbox.</p>
                <button
                  type="button"
                  onClick={() => { setShowReset(false); setResetStatus('idle'); setResetEmail('') }}
                  className="bg-white text-black px-8 py-4 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all"
                >
                  Back to Sign In
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors"
                  />
                </div>
                {resetStatus === 'error' && <p className="text-red-400 text-sm">{resetError}</p>}
                <button type="submit" disabled={resetStatus === 'loading'}
                  className="bg-white text-black px-8 py-4 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all disabled:opacity-50">
                  {resetStatus === 'loading' ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowReset(false); setResetStatus('idle'); setResetError('') }}
                  className="text-white/40 hover:text-white text-sm font-headline uppercase tracking-widest transition-colors"
                >
                  ← Back to Sign In
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  )
}
