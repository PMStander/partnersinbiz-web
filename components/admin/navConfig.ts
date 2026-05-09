export interface NavItem {
  label: string
  href: string
  icon: string
}

export const OPERATOR_NAV: NavItem[] = [
  { label: 'Dashboard',      href: '/admin/dashboard',           icon: 'space_dashboard' },
  { label: 'Properties',     href: '/admin/properties',          icon: 'apartment' },
  { label: 'Analytics',      href: '/admin/analytics',           icon: 'analytics' },
  { label: 'Pipeline',       href: '/admin/crm/contacts',        icon: 'view_kanban' },
  { label: 'Clients',        href: '/admin/clients',             icon: 'groups' },
  { label: 'Invoicing',      href: '/admin/invoicing',           icon: 'receipt_long' },
  { label: 'Recurring',      href: '/admin/invoicing/recurring', icon: 'autorenew' },
  { label: 'Quotes',         href: '/admin/quotes',              icon: 'request_quote' },
  { label: 'Platform users', href: '/admin/platform-users',      icon: 'shield_person' },
  { label: 'Settings',       href: '/admin/settings',            icon: 'settings' },
]

export function workspaceNav(slug: string): NavItem[] {
  return [
    { label: 'Dashboard', href: `/admin/org/${slug}/dashboard`, icon: 'space_dashboard' },
    { label: 'Projects',  href: `/admin/org/${slug}/projects`,  icon: 'rocket_launch' },
    { label: 'Brand',     href: `/admin/org/${slug}/brand`,     icon: 'palette' },
    { label: 'Team',      href: `/admin/org/${slug}/team`,      icon: 'groups' },
    { label: 'Billing',   href: `/admin/org/${slug}/billing`,   icon: 'payments' },
    { label: 'Activity',  href: `/admin/org/${slug}/activity`,  icon: 'pulse_alert' },
    { label: 'Settings',  href: `/admin/org/${slug}/settings`,  icon: 'settings' },
  ]
}

export const OPERATOR_TOOLS: NavItem[] = [
  { label: 'Social',    href: '/admin/social',    icon: 'campaign' },
  { label: 'SEO',       href: '/admin/seo',        icon: 'trending_up' },
  { label: 'Email',     href: '/admin/email',      icon: 'mail' },
  { label: 'Sequences', href: '/admin/sequences',  icon: 'stacked_email' },
]

export function workspaceTools(slug: string): NavItem[] {
  return [
    { label: 'Social Media',    href: `/admin/org/${slug}/social`,          icon: 'campaign' },
    { label: 'SEO Sprint',      href: `/admin/org/${slug}/seo`,             icon: 'trending_up' },
    { label: 'Email',           href: '/admin/email',                        icon: 'mail' },
    { label: 'Sequences',       href: '/admin/sequences',                    icon: 'stacked_email' },
    { label: 'Campaigns',       href: `/admin/org/${slug}/campaigns`,        icon: 'flag' },
    { label: 'Capture Sources', href: `/admin/org/${slug}/capture-sources`,  icon: 'inventory_2' },
    { label: 'Integrations',    href: `/admin/org/${slug}/integrations`,     icon: 'extension' },
    { label: 'Email Domains',   href: `/admin/org/${slug}/email-domains`,    icon: 'dns' },
  ]
}
