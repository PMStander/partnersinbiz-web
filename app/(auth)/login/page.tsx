'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginWithEmail } from '@/lib/firebase/auth'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center px-8 pt-20">
      <div className="glass-card p-10 w-full max-w-md">
        <h1 className="font-headline text-3xl font-bold tracking-tighter mb-8">Sign In</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email</label>
            <input name="email" type="email" required
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Password</label>
            <input name="password" type="password" required
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors" />
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
      </div>
    </main>
  )
}
