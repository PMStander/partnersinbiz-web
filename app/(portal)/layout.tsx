'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { logout } from '@/lib/firebase/auth'

const NAV_LINKS = [
  { href: '/portal/dashboard', label: 'Dashboard' },
  { href: '/portal/properties', label: 'Properties' },
  { href: '/portal/reports', label: 'Reports' },
  { href: '/portal/project', label: 'Project' },
  { href: '/portal/social', label: 'Social' },
  { href: '/portal/messages', label: 'Messages' },
  { href: '/portal/payments', label: 'Payments' },
  { href: '/portal/data', label: 'Data' },
]

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState('')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login')
      } else {
        setEmail(user.email ?? '')
        setChecking(false)
      }
    })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="w-5 h-5 border border-[var(--color-outline-variant)] border-t-[var(--color-accent-v2)] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-on-surface)] flex flex-col">
      {/* Portal top nav */}
      <header className="border-b border-[var(--color-outline-variant)] px-8 h-16 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-8">
          <Link href="/portal/dashboard" className="font-headline font-bold tracking-tighter text-lg text-[var(--color-accent-v2)]">
            PiB Portal
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-sm font-label transition-colors rounded ${
                  pathname === link.href || pathname.startsWith(link.href + '/')
                    ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent-v2)]'
                    : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-[var(--color-on-surface-variant)] hidden sm:block">{email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] transition-colors font-label uppercase tracking-widest"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8 max-w-5xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
