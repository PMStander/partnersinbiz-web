'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useOrg } from '@/lib/contexts/OrgContext'
import { OrgSwitcher } from './OrgSwitcher'
import { OPERATOR_NAV, OPERATOR_TOOLS, workspaceNav, workspaceTools, type NavItem } from './navConfig'

interface AdminTopbarNavProps {
  userEmail: string
  onToggleLayout: () => void
}

function TopbarNavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all duration-150',
        isActive
          ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
          : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.04]',
      ].join(' ')}
    >
      <span
        className={[
          'material-symbols-outlined text-[18px] shrink-0',
          isActive ? 'text-[var(--color-pib-accent)]' : 'opacity-70',
        ].join(' ')}
      >
        {item.icon}
      </span>
      <span className="hidden lg:inline font-medium">{item.label}</span>
    </Link>
  )
}

export function AdminTopbarNav({ userEmail, onToggleLayout }: AdminTopbarNavProps) {
  const pathname = usePathname()
  const { selectedOrgId, orgs } = useOrg()
  const [mobileOpen, setMobileOpen] = useState(false)

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId)
  const isWorkspaceMode = !!selectedOrgId && !!selectedOrg
  const navItems = isWorkspaceMode ? workspaceNav(selectedOrg.slug) : OPERATOR_NAV
  const toolItems = isWorkspaceMode ? workspaceTools(selectedOrg.slug) : OPERATOR_TOOLS

  const initials = userEmail.split(/[.\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join('')

  // close mobile menu on nav
  useEffect(() => { setMobileOpen(false) }, [pathname])

  return (
    <>
      {/* Main topbar */}
      <header className="h-14 sticky top-0 z-30 bg-[var(--color-pib-bg)]/95 backdrop-blur-md border-b border-[var(--color-pib-line)] shrink-0">
        <div className="flex items-center h-full px-4 gap-3">

          {/* Brand */}
          <Link href="/admin/dashboard" className="flex items-center gap-2 shrink-0 mr-2">
            <Image src="/pib-logo-512.png" alt="Partners in Biz" width={24} height={24} className="rounded-md object-contain" />
            <span className="hidden sm:block font-display text-base leading-none">Partners in Biz</span>
            <span className={['pill !text-[10px] !py-0.5 !px-2', isWorkspaceMode ? 'pill-accent' : ''].join(' ')}>
              {isWorkspaceMode ? 'Client' : 'Admin'}
            </span>
          </Link>

          {/* Org switcher (compact) */}
          <div className="hidden md:block shrink-0">
            <OrgSwitcher />
          </div>

          <div className="w-px h-5 bg-[var(--color-pib-line)] shrink-0 hidden md:block" />

          {/* Nav items — scrollable */}
          <nav className="hidden md:flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {navItems.map((item) => (
              <TopbarNavLink key={item.href} item={item} pathname={pathname} />
            ))}
            <div className="w-px h-5 bg-[var(--color-pib-line)] shrink-0 mx-1" />
            {toolItems.map((item) => (
              <TopbarNavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* Layout toggle */}
            <button
              onClick={onToggleLayout}
              title="Switch to sidebar layout"
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.05] transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">dock_to_right</span>
            </button>

            <span className="hidden lg:inline text-xs font-mono text-[var(--color-pib-text-muted)] truncate max-w-[180px]">
              {userEmail}
            </span>
            <div className="w-8 h-8 rounded-full bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line-strong)] flex items-center justify-center text-xs font-medium text-[var(--color-pib-accent-hover)]">
              {initials || '·'}
            </div>
            <a
              href="/api/auth/logout"
              className="text-xs text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </a>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Open menu"
              className="md:hidden flex flex-col justify-center items-center w-9 h-9 gap-[4px] rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <span className="block w-4 h-[1.5px] bg-[var(--color-pib-text-muted)]" />
              <span className="block w-4 h-[1.5px] bg-[var(--color-pib-text-muted)]" />
              <span className="block w-4 h-[1.5px] bg-[var(--color-pib-text-muted)]" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 mt-14 bg-[var(--color-sidebar)] border-b border-[var(--color-pib-line)] p-4 flex flex-col gap-1">
            <OrgSwitcher />
            <div className="h-px bg-[var(--color-pib-line)] my-2" />
            {navItems.map((item) => (
              <TopbarNavLink key={item.href} item={item} pathname={pathname} />
            ))}
            <div className="h-px bg-[var(--color-pib-line)] my-2" />
            <p className="px-3 pb-1 text-[9px] uppercase tracking-widest text-[var(--color-pib-text-muted)] font-medium">Tools</p>
            {toolItems.map((item) => (
              <TopbarNavLink key={item.href} item={item} pathname={pathname} />
            ))}
            <div className="h-px bg-[var(--color-pib-line)] my-2" />
            <button
              onClick={onToggleLayout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] rounded-lg hover:bg-white/[0.04]"
            >
              <span className="material-symbols-outlined text-[18px]">dock_to_right</span>
              Switch to sidebar layout
            </button>
          </div>
        </div>
      )}
    </>
  )
}
