'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { OrgSwitcher } from './OrgSwitcher'
import GlobalSearch from './GlobalSearch'
import { useOrg } from '@/lib/contexts/OrgContext'
import { OPERATOR_NAV, workspaceNav, type NavItem } from './navConfig'

// ── Sidebar nav item ───────────────────────────────────────────────────────

function isItemActive(item: NavItem, pathname: string) {
  if (pathname === item.href || pathname.startsWith(item.href + '/')) return true
  if (item.children?.some((child) => pathname === child.href || pathname.startsWith(child.href + '/'))) return true
  return item.activePatterns?.some((pattern) => pathname === pattern || pathname.startsWith(pattern + '/')) ?? false
}

function NavLink({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed?: boolean }) {
  const isActive = isItemActive(item, pathname)
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={[
        'flex items-center rounded-lg text-sm transition-all duration-150',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2',
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
      {!collapsed && <span className="font-medium">{item.label}</span>}
    </Link>
  )
}

// ── Main sidebar ───────────────────────────────────────────────────────────

interface AdminSidebarProps {
  open?: boolean
  onClose?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
}

export function AdminSidebar({ open = false, onClose, collapsed = false, onToggleCollapsed }: AdminSidebarProps) {
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
          'shrink-0 flex flex-col border-r border-[var(--color-pib-line)] bg-[var(--color-sidebar)] overflow-y-auto',
          'md:h-screen md:sticky md:top-0 md:translate-x-0 md:z-auto',
          'fixed top-0 left-0 h-full z-50 transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-64',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        ].join(' ')}
      >
        {/* Brand */}
        <div className={['h-16 flex items-center border-b border-[var(--color-pib-line)] shrink-0', collapsed ? 'justify-center px-0' : 'gap-2.5 px-5'].join(' ')}>
          <Image src="/pib-logo-512.png" alt="Partners in Biz" width={28} height={28} className="rounded-md object-contain shrink-0" />
          {!collapsed && (
            <>
              <span className="font-display text-lg leading-none">Partners in Biz</span>
              <span className={['ml-auto pill !text-[10px] !py-0.5 !px-2', isWorkspaceMode ? 'pill-accent' : ''].join(' ')}>
                {isWorkspaceMode ? 'Client' : 'Admin'}
              </span>
            </>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={[
            'hidden md:flex items-center justify-center h-8 text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors border-b border-[var(--color-pib-line)]',
            collapsed ? 'w-full' : 'w-full px-5',
          ].join(' ')}
        >
          <span className="material-symbols-outlined text-[18px]">
            {collapsed ? 'chevron_right' : 'chevron_left'}
          </span>
          {!collapsed && <span className="ml-auto text-[10px] opacity-50">collapse</span>}
        </button>

        {/* Search */}
        {!collapsed && (
          <div className="px-3 pt-4 pb-3">
            <GlobalSearch />
          </div>
        )}

        {/* Org Switcher */}
        {!collapsed && (
          <div className="border-t border-[var(--color-pib-line)] py-3">
            <p className="eyebrow !text-[9px] px-5 mb-1.5">Context</p>
            <OrgSwitcher />
          </div>
        )}

        {/* Navigation */}
        {!collapsed && (
          <div className="px-3 pt-3 pb-1">
            <p className="eyebrow !text-[9px] px-2 mb-2">Navigation</p>
          </div>
        )}
        <nav className={['flex-1 space-y-1', collapsed ? 'px-2 pt-3' : 'px-3'].join(' ')}>
          {navItems.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </nav>

        {!isWorkspaceMode && !collapsed && favoriteOrgs.length > 0 && (
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
