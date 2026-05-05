'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { logout } from '@/lib/firebase/auth'

interface NavItem {
  href: string
  label: string
  icon: string
  group: 'work' | 'data' | 'comms'
}

const NAV_LINKS: NavItem[] = [
  { href: '/portal/dashboard',  label: 'Dashboard',  icon: 'space_dashboard',  group: 'work' },
  { href: '/portal/project',    label: 'Projects',   icon: 'rocket_launch',    group: 'work' },
  { href: '/portal/social',     label: 'Social',     icon: 'campaign',         group: 'work' },
  { href: '/portal/seo',        label: 'SEO',        icon: 'trending_up',      group: 'work' },
  { href: '/portal/properties', label: 'Properties', icon: 'apartment',        group: 'data' },
  { href: '/portal/reports',    label: 'Reports',    icon: 'analytics',        group: 'data' },
  { href: '/portal/data',       label: 'Data',       icon: 'database',         group: 'data' },
  { href: '/portal/messages',   label: 'Messages',   icon: 'forum',            group: 'comms' },
  { href: '/portal/payments',   label: 'Payments',   icon: 'payments',         group: 'comms' },
]

const GROUP_LABELS: Record<NavItem['group'], string> = {
  work: 'Workspace',
  data: 'Insights',
  comms: 'Account',
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/')
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [checking, setChecking] = useState(true)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push('/login')
      } else {
        setEmail(user.email ?? '')
        setName(user.displayName ?? user.email?.split('@')[0] ?? '')
        setChecking(false)
      }
    })
  }, [router])

  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  async function handleLogout() {
    await logout()
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
    router.push('/')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[var(--color-pib-bg)] flex items-center justify-center">
        <span className="relative flex h-3 w-3">
          <span className="absolute inset-0 rounded-full bg-[var(--color-pib-accent)] opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-[var(--color-pib-accent)]" />
        </span>
      </div>
    )
  }

  const grouped = (['work', 'data', 'comms'] as const).map((g) => ({
    group: g,
    items: NAV_LINKS.filter((n) => n.group === g),
  }))

  const initials = (name || email).split(/[.\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')

  return (
    <div className="min-h-screen bg-[var(--color-pib-bg)] text-[var(--color-pib-text)] flex">
      {/* Mobile backdrop */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside
        className={[
          'w-[260px] shrink-0 flex flex-col border-r border-[var(--color-pib-line)] bg-[var(--color-pib-bg)]',
          'fixed top-0 left-0 h-screen z-50 transition-transform duration-300 ease-in-out',
          'md:sticky md:top-0 md:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Brand */}
        <Link
          href="/portal/dashboard"
          className="flex items-center gap-2.5 px-5 h-16 border-b border-[var(--color-pib-line)] shrink-0"
        >
          <Image src="/pib-logo-512.png" alt="Partners in Biz" width={28} height={28} className="rounded-md object-contain" />
          <span className="font-display text-lg leading-none">Partners in Biz</span>
          <span className="ml-auto pill !text-[10px] !py-0.5 !px-2">Client</span>
        </Link>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {grouped.map(({ group, items }) => (
            <div key={group} className="space-y-1">
              <p className="eyebrow !text-[10px] px-3 mb-2">{GROUP_LABELS[group]}</p>
              {items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                      active
                        ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
                        : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.03]',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'material-symbols-outlined text-[20px] shrink-0',
                        active ? 'text-[var(--color-pib-accent)]' : 'opacity-70',
                      ].join(' ')}
                    >
                      {item.icon}
                    </span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User chip */}
        <div className="border-t border-[var(--color-pib-line)] p-3 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-xs font-medium text-[var(--color-pib-accent-hover)] shrink-0">
              {initials || '·'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{name || 'Client'}</p>
              <p className="text-[11px] text-[var(--color-pib-text-muted)] truncate">{email}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors p-1"
              aria-label="Sign out"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar (mobile menu + breadcrumb) */}
        <header className="h-14 sticky top-0 z-30 bg-[var(--color-pib-bg)]/80 backdrop-blur-md border-b border-[var(--color-pib-line)] flex items-center px-4 md:px-8 gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[4px] rounded-lg hover:bg-white/[0.06] transition-colors -ml-1.5"
          >
            <span className="block w-4 h-[1.5px] bg-[var(--color-pib-text-muted)]" />
            <span className="block w-4 h-[1.5px] bg-[var(--color-pib-text-muted)]" />
            <span className="block w-4 h-[1.5px] bg-[var(--color-pib-text-muted)]" />
          </button>
          <span className="eyebrow !text-[10px]">Client portal</span>
          <span className="hidden sm:inline w-1 h-1 rounded-full bg-[var(--color-pib-line-strong)]" />
          <span className="hidden sm:inline text-xs text-[var(--color-pib-text-muted)]">
            {NAV_LINKS.find((n) => isActive(pathname, n.href))?.label ?? 'Dashboard'}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <a
              href="mailto:hello@partnersinbiz.co.za"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">support_agent</span>
              Need help?
            </a>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-8 max-w-6xl mx-auto w-full">{children}</main>

        <footer className="px-4 md:px-8 py-6 border-t border-[var(--color-pib-line)] text-[var(--color-pib-text-muted)] text-xs flex flex-wrap items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} Partners in Biz · Pretoria</span>
          <div className="flex items-center gap-4">
            <Link href="/privacy-policy" className="hover:text-[var(--color-pib-text)] transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-[var(--color-pib-text)] transition-colors">Terms</Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
