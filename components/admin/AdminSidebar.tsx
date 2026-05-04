'use client'

import Link from 'next/link'
import Image from 'next/image'
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
  { label: 'Dashboard',   href: '/admin/dashboard',          icon: 'space_dashboard' },
  { label: 'Properties',  href: '/admin/properties',         icon: 'apartment' },
  { label: 'Analytics',   href: '/admin/analytics',          icon: 'analytics' },
  { label: 'Pipeline',    href: '/admin/crm/contacts',       icon: 'view_kanban' },
  { label: 'Clients',     href: '/admin/clients',            icon: 'groups' },
  { label: 'Invoicing',   href: '/admin/invoicing',          icon: 'receipt_long' },
  { label: 'Recurring',   href: '/admin/invoicing/recurring', icon: 'autorenew' },
  { label: 'Quotes',      href: '/admin/quotes',             icon: 'request_quote' },
  { label: 'Settings',    href: '/admin/settings',           icon: 'settings' },
]

function workspaceNav(slug: string): NavItem[] {
  return [
    { label: 'Dashboard', href: `/admin/org/${slug}/dashboard`, icon: 'space_dashboard' },
    { label: 'Projects',  href: `/admin/org/${slug}/projects`,  icon: 'rocket_launch' },
    { label: 'Social',    href: `/admin/org/${slug}/social`,    icon: 'campaign' },
    { label: 'Brand',     href: `/admin/org/${slug}/brand`,     icon: 'palette' },
    { label: 'Team',      href: `/admin/org/${slug}/team`,      icon: 'groups' },
    { label: 'Billing',   href: `/admin/org/${slug}/billing`,   icon: 'payments' },
    { label: 'Activity',  href: `/admin/org/${slug}/activity`,  icon: 'pulse_alert' },
    { label: 'Settings',  href: `/admin/org/${slug}/settings`,  icon: 'settings' },
  ]
}

// ── Sidebar nav item ───────────────────────────────────────────────────────

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      className={[
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
        isActive
          ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
          : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.03]',
      ].join(' ')}
    >
      <span
        className={[
          'material-symbols-outlined text-[20px] shrink-0',
          isActive ? 'text-[var(--color-pib-accent)]' : 'opacity-70',
        ].join(' ')}
      >
        {item.icon}
      </span>
      <span className="font-medium">{item.label}</span>
    </Link>
  )
}

function SectionLink({ item, pathname }: { item: { label: string; href: string }; pathname: string }) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
  return (
    <Link
      href={item.href}
      className={[
        'flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors duration-150',
        isActive
          ? 'bg-[var(--color-pib-accent-soft)] text-[var(--color-pib-accent-hover)]'
          : 'text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.03]',
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

  const navItems = isWorkspaceMode ? workspaceNav(selectedOrg.slug) : OPERATOR_NAV
  const favoriteOrgs = orgs.slice(0, 4)

  useEffect(() => {
    onClose?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

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
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden="true"
      />

      <aside
        className={[
          'w-64 shrink-0 flex flex-col border-r border-[var(--color-pib-line)] bg-[var(--color-sidebar)] overflow-y-auto',
          'md:h-screen md:sticky md:top-0 md:translate-x-0 md:z-auto',
          'fixed top-0 left-0 h-full z-50 transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Brand */}
        <div className="px-5 h-16 flex items-center gap-2.5 border-b border-[var(--color-pib-line)] shrink-0">
          <Image src="/pib-logo-512.png" alt="Partners in Biz" width={28} height={28} className="rounded-md object-contain" />
          <span className="font-display text-lg leading-none">Partners in Biz</span>
          <span
            className={[
              'ml-auto pill !text-[10px] !py-0.5 !px-2',
              isWorkspaceMode ? 'pill-accent' : '',
            ].join(' ')}
          >
            {isWorkspaceMode ? 'Client' : 'Admin'}
          </span>
        </div>

        {/* Search */}
        <div className="px-3 pt-4 pb-3">
          <GlobalSearch />
        </div>

        {/* Org Switcher */}
        <div className="border-t border-[var(--color-pib-line)] py-3">
          <p className="eyebrow !text-[9px] px-5 mb-1.5">Context</p>
          <OrgSwitcher />
        </div>

        {/* Navigation */}
        <div className="px-3 pt-3 pb-1">
          <p className="eyebrow !text-[9px] px-2 mb-2">Navigation</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>

        {/* Bottom sections */}
        {isWorkspaceMode && (
          <div className="border-t border-[var(--color-pib-line)] px-3 py-3 space-y-1">
            <p className="eyebrow !text-[9px] px-2 pb-1.5">Social</p>
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
          <div className="border-t border-[var(--color-pib-line)] px-3 py-3 space-y-1">
            <p className="eyebrow !text-[9px] px-2 pb-1.5">Tools</p>
            {[
              { label: 'Social',    href: '/admin/social' },
              { label: 'Email',     href: '/admin/email' },
              { label: 'Sequences', href: '/admin/sequences' },
            ].map((item) => (
              <SectionLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        )}

        {!isWorkspaceMode && favoriteOrgs.length > 0 && (
          <div className="border-t border-[var(--color-pib-line)] px-3 py-3 space-y-1">
            <p className="eyebrow !text-[9px] px-2 pb-1">Favorites</p>
            {favoriteOrgs.map((org) => (
              <Link
                key={org.id}
                href={`/admin/org/${org.slug}/dashboard`}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.03] transition-colors"
              >
                <span className="w-6 h-6 rounded-md bg-[var(--color-pib-surface-2)] border border-[var(--color-pib-line)] flex items-center justify-center text-[10px] font-bold text-[var(--color-pib-text-muted)] shrink-0">
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
