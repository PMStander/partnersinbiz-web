import Link from 'next/link'

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard' },
  { label: 'Contacts',   href: '/admin/crm/contacts',  group: 'CRM' },
  { label: 'Pipeline',   href: '/admin/crm/pipeline',  group: 'CRM' },
  { label: 'Inbox',      href: '/admin/email',          group: 'Email' },
  { label: 'Sequences',  href: '/admin/sequences' },
  { label: 'Marketing',  href: '/admin/marketing' },
  { label: 'Overview',   href: '/admin/social',          group: 'Social' },
  { label: 'Compose',    href: '/admin/social/compose',   group: 'Social' },
  { label: 'Queue',      href: '/admin/social/queue',     group: 'Social' },
  { label: 'Calendar',   href: '/admin/social/calendar',  group: 'Social' },
  { label: 'Replies',    href: '/admin/social/replies',   group: 'Social' },
  { label: 'History',    href: '/admin/social/history',   group: 'Social' },
  { label: 'Projects',   href: '/admin/projects' },
  { label: 'Clients',    href: '/admin/clients' },
  { label: 'Settings',   href: '/admin/settings' },
]

export function AdminSidebar() {
  let currentGroup = ''
  return (
    <aside
      className="w-56 shrink-0 flex flex-col border-r border-outline-variant h-screen sticky top-0 overflow-y-auto"
      style={{ background: 'var(--color-sidebar)' }}
    >
      {/* Logo */}
      <div className="px-6 py-5 border-b border-outline-variant">
        <span className="font-headline text-sm font-bold tracking-widest uppercase text-on-surface">
          PiB
        </span>
        <span className="ml-2 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const showGroupLabel = item.group && item.group !== currentGroup
          if (item.group) currentGroup = item.group
          return (
            <div key={item.href}>
              {showGroupLabel && (
                <p className="px-3 pt-4 pb-1 text-[9px] font-label uppercase tracking-widest text-on-surface-variant/50">
                  {item.group}
                </p>
              )}
              <Link
                href={item.href}
                className="flex items-center px-3 py-2 text-sm font-label text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
              >
                {item.label}
              </Link>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
