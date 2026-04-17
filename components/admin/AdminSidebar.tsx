'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { OrgSwitcher } from './OrgSwitcher'
import GlobalSearch from './GlobalSearch'
import { useOrg } from '@/lib/contexts/OrgContext'

// ── Nav definitions ────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: string
}

const OPERATOR_NAV: NavItem[] = [
  { label: 'Dashboard',   href: '/admin/dashboard',          icon: '⊞' },
  { label: 'Properties',  href: '/admin/properties',         icon: '◉' },
  { label: 'Pipeline',    href: '/admin/crm/contacts',       icon: '⟳' },
  { label: 'Clients',    href: '/admin/clients',         icon: '◎' },
  { label: 'Invoicing',  href: '/admin/invoicing',       icon: '◷' },
  { label: 'Recurring',  href: '/admin/invoicing/recurring', icon: '↺' },
  { label: 'Quotes',     href: '/admin/quotes',          icon: '◈' },
  { label: 'Settings',   href: '/admin/settings',        icon: '◆' },
]

function workspaceNav(slug: string): NavItem[] {
  return [
    { label: 'Dashboard', href: `/admin/org/${slug}/dashboard`, icon: '⊞' },
    { label: 'Projects',  href: `/admin/org/${slug}/projects`,  icon: '◈' },
    { label: 'Social',    href: `/admin/org/${slug}/social`,    icon: '◉' },
    { label: 'Brand',     href: `/admin/org/${slug}/brand`,     icon: '◆' },
    { label: 'Team',      href: `/admin/org/${slug}/team`,      icon: '◎' },
    { label: 'Billing',   href: `/admin/org/${slug}/billing`,   icon: '◷' },
    { label: 'Activity',  href: `/admin/org/${slug}/activity`,  icon: '⟳' },
    { label: 'Settings',  href: `/admin/org/${slug}/settings`,  icon: '◆' },
  ]
}

// ── Sidebar nav item ───────────────────────────────────────────────────────

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      className={[
        'flex items-center gap-3 px-4 py-2.5 text-[13px] font-label rounded-lg transition-all duration-150',
        isActive
          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent-text)]'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-[var(--color-surface-container)]',
      ].join(' ')}
    >
      <span className={['text-sm shrink-0', isActive ? 'text-[var(--color-accent-v2)]' : 'opacity-50'].join(' ')}>
        {item.icon}
      </span>
      {item.label}
    </Link>
  )
}

function SectionLink({ item, pathname }: { item: { label: string; href: string }; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      className={[
        'flex items-center px-4 py-2 text-[13px] font-label rounded-lg transition-all duration-150',
        isActive
          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent-text)]'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-[var(--color-surface-container)]',
      ].join(' ')}
    >
      {item.label}
    </Link>
  )
}

// ── Main sidebar ───────────────────────────────────────────────────────────

interface AdminSidebarProps {
  open?: boolean
  onClose?: () => void
}

export function AdminSidebar({ open = false, onClose }: AdminSidebarProps) {
  const pathname = usePathname()
  const { selectedOrgId, orgs } = useOrg()

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId)
  const isWorkspaceMode = !!selectedOrgId && !!selectedOrg

  const navItems = isWorkspaceMode
    ? workspaceNav(selectedOrg.slug)
    : OPERATOR_NAV

  // Recent orgs for favorites (up to 4)
  const favoriteOrgs = orgs.slice(0, 4)

  // Auto-close drawer on navigation
  useEffect(() => {
    onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Prevent body scroll while drawer is open on mobile
  useEffect(() => {
    if (typeof window === 'undefined') return
    const isMobile = window.matchMedia('(max-width: 767px)').matches
    if (open && isMobile) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <aside
        className={[
          'w-60 shrink-0 flex flex-col border-r border-[var(--color-card-border)] overflow-y-auto',
          // Desktop: sticky sidebar
          'md:h-screen md:sticky md:top-0 md:translate-x-0 md:z-auto',
          // Mobile: fixed drawer
          'fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
        style={{ background: 'var(--color-sidebar)' }}
      >
      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[var(--color-accent-v2)] flex items-center justify-center">
          <span className="font-headline text-[11px] font-black text-black tracking-tight">P</span>
        </div>
        <span className="font-headline text-sm font-bold tracking-wide text-on-surface">
          PiB
        </span>
        <span
          className="text-[9px] font-label uppercase tracking-widest px-1.5 py-0.5 rounded ml-auto"
          style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
        >
          {isWorkspaceMode ? 'Client' : 'Admin'}
        </span>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <GlobalSearch />
      </div>

      {/* Org Switcher */}
      <div className="border-t border-[var(--color-card-border)] py-2">
        <p className="px-5 pt-1 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/50">
          Context
        </p>
        <OrgSwitcher />
      </div>

      {/* Navigation */}
      <div className="px-3 pt-2 pb-1">
        <p className="px-2 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40 mb-2">
          Navigation
        </p>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Bottom section links */}
      {isWorkspaceMode && (
        <div className="border-t border-[var(--color-card-border)] px-3 py-3 space-y-0.5">
          <p className="px-2 pb-1.5 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40">
            Social
          </p>
          {[
            { label: 'Accounts', href: '/admin/social/accounts' },
            { label: 'Compose',  href: '/admin/social/compose' },
            { label: 'Inbox',    href: '/admin/social/inbox' },
            { label: 'Queue',    href: '/admin/social/queue' },
            { label: 'Calendar', href: '/admin/social/calendar' },
            { label: 'Design',   href: '/admin/social/design' },
            { label: 'Links',    href: '/admin/social/links' },
          ].map((item) => (
            <SectionLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}

      {!isWorkspaceMode && (
        <div className="border-t border-[var(--color-card-border)] px-3 py-3 space-y-0.5">
          <p className="px-2 pb-1.5 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40">
            Tools
          </p>
          {[
            { label: 'Social',    href: '/admin/social' },
            { label: 'Email',     href: '/admin/email' },
            { label: 'Sequences', href: '/admin/sequences' },
          ].map((item) => (
            <SectionLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}

      {/* Favorites — recent orgs */}
      {!isWorkspaceMode && favoriteOrgs.length > 0 && (
        <div className="border-t border-[var(--color-card-border)] px-3 py-3 space-y-1">
          <p className="px-2 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40">
            Favorites
          </p>
          {favoriteOrgs.map((org) => (
            <Link
              key={org.id}
              href={`/admin/org/${org.slug}/dashboard`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-label text-on-surface-variant hover:text-on-surface hover:bg-[var(--color-surface-container)] transition-colors"
            >
              <span className="w-5 h-5 rounded bg-[var(--color-surface-container-high)] flex items-center justify-center text-[10px] font-bold text-on-surface-variant shrink-0">
                {org.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="truncate">{org.name}</span>
            </Link>
          ))}
        </div>
      )}
      </aside>
    </>
  )
}
