'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { OrgSwitcher } from './OrgSwitcher'
import GlobalSearch from './GlobalSearch'
import { useOrg } from '@/lib/contexts/OrgContext'

// ── Nav definitions ────────────────────────────────────────────────────────

interface NavItem {
  label: string
  href: string
  icon: string
}

// Operator view — when no org is selected (platform_owner top-level)
const OPERATOR_NAV: NavItem[] = [
  { label: 'Command Center', href: '/admin/dashboard', icon: '◈' },
  { label: 'Pipeline',       href: '/admin/crm/contacts', icon: '⟳' },
  { label: 'Clients',        href: '/admin/clients', icon: '◻' },
  { label: 'Invoicing',      href: '/admin/invoicing', icon: '◷' },
  { label: 'Settings',       href: '/admin/settings', icon: '◎' },
]

// Workspace view — when an org is selected (viewing a client workspace)
function workspaceNav(slug: string): NavItem[] {
  return [
    { label: 'Dashboard', href: `/admin/org/${slug}/dashboard`, icon: '◈' },
    { label: 'Projects',  href: `/admin/org/${slug}/projects`, icon: '⊞' },
    { label: 'Social',    href: `/admin/org/${slug}/social`, icon: '◉' },
    { label: 'Brand',     href: `/admin/org/${slug}/brand`, icon: '◆' },
    { label: 'Team',      href: `/admin/org/${slug}/team`, icon: '◎' },
    { label: 'Billing',   href: `/admin/org/${slug}/billing`, icon: '◷' },
    { label: 'Activity',  href: `/admin/org/${slug}/activity`, icon: '◷' },
    { label: 'Settings',  href: `/admin/org/${slug}/settings`, icon: '◎' },
  ]
}

// ── Sidebar nav item ───────────────────────────────────────────────────────

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      className={[
        'flex items-center gap-3 px-3 py-2.5 text-sm font-label pib-nav-item',
        isActive
          ? 'pib-nav-active'
          : 'text-on-surface-variant hover:text-on-surface',
      ].join(' ')}
    >
      <span className={['text-base shrink-0', isActive ? 'text-[var(--color-accent-v2)]' : 'text-on-surface-variant'].join(' ')}>
        {item.icon}
      </span>
      {item.label}
    </Link>
  )
}

// ── Main sidebar ───────────────────────────────────────────────────────────

export function AdminSidebar() {
  const pathname = usePathname()
  const { selectedOrgId, orgs } = useOrg()

  // Find the selected org to get its slug
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId)
  const isWorkspaceMode = !!selectedOrgId && !!selectedOrg

  const navItems = isWorkspaceMode
    ? workspaceNav(selectedOrg.slug)
    : OPERATOR_NAV

  const modeLabel = isWorkspaceMode ? selectedOrg.name : 'Operator'

  return (
    <aside
      className="w-56 shrink-0 flex flex-col border-r border-outline-variant h-screen sticky top-0 overflow-y-auto"
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* Logo */}
      <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-2">
        <span className="font-headline text-sm font-bold tracking-widest uppercase text-on-surface">
          PiB
        </span>
        <span
          className="text-[9px] font-label uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent-text)',
          }}
        >
          {isWorkspaceMode ? 'Client' : 'Admin'}
        </span>
      </div>

      {/* Global Search */}
      <div className="border-b border-outline-variant px-5 py-3">
        <GlobalSearch />
      </div>

      {/* Org Switcher */}
      <div className="border-b border-outline-variant py-2">
        <p className="px-5 pt-1 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/50">
          Context
        </p>
        <OrgSwitcher />
      </div>

      {/* Mode indicator */}
      <div className="px-5 py-2 border-b border-outline-variant/50">
        <p className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40">
          {isWorkspaceMode ? 'Workspace' : 'Platform'}
        </p>
        <p className="text-xs font-label text-on-surface-variant truncate mt-0.5">
          {modeLabel}
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* Bottom: social quick links when in workspace mode */}
      {isWorkspaceMode && (
        <div className="border-t border-outline-variant px-2 py-3 space-y-0.5">
          <p className="px-3 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40">
            Social
          </p>
          {[
            { label: 'Compose', href: '/admin/social/compose' },
            { label: 'Inbox', href: '/admin/social/inbox' },
            { label: 'Queue', href: '/admin/social/queue' },
            { label: 'Calendar', href: '/admin/social/calendar' },
            { label: 'Design', href: '/admin/social/design' },
            { label: 'Links', href: '/admin/social/links' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center px-3 py-2 text-sm font-label pib-nav-item',
                pathname === item.href
                  ? 'pib-nav-active'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* Bottom: platform tools when in operator mode */}
      {!isWorkspaceMode && (
        <div className="border-t border-outline-variant px-2 py-3 space-y-0.5">
          <p className="px-3 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/40">
            Tools
          </p>
          {[
            { label: 'Social', href: '/admin/social' },
            { label: 'Email', href: '/admin/email' },
            { label: 'Sequences', href: '/admin/sequences' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center px-3 py-2 text-sm font-label pib-nav-item',
                pathname.startsWith(item.href)
                  ? 'pib-nav-active'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </aside>
  )
}
