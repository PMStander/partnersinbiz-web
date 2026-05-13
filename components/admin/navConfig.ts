export interface SubLink {
  label: string
  href: string
}

export interface NavItem {
  label: string
  href: string
  icon: string
  children?: SubLink[]
}

// ── Operator nav ────────────────────────────────────────────────────────────

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
  { label: 'Agents',         href: '/admin/agents',              icon: 'group_work' },
  { label: 'Settings',       href: '/admin/settings',            icon: 'settings' },
]

// Topbar groups Invoicing/Recurring/Quotes into one dropdown
export const OPERATOR_NAV_TOPBAR: NavItem[] = [
  { label: 'Dashboard',      href: '/admin/dashboard',      icon: 'space_dashboard' },
  { label: 'Properties',     href: '/admin/properties',     icon: 'apartment' },
  { label: 'Analytics',      href: '/admin/analytics',      icon: 'analytics' },
  { label: 'Pipeline',       href: '/admin/crm/contacts',   icon: 'view_kanban' },
  { label: 'Clients',        href: '/admin/clients',        icon: 'groups' },
  {
    label: 'Invoicing', href: '/admin/invoicing', icon: 'receipt_long',
    children: [
      { label: 'Invoices',  href: '/admin/invoicing' },
      { label: 'Recurring', href: '/admin/invoicing/recurring' },
      { label: 'Quotes',    href: '/admin/quotes' },
    ],
  },
  { label: 'Platform users', href: '/admin/platform-users', icon: 'shield_person' },
  { label: 'Agents',         href: '/admin/agents',         icon: 'group_work' },
  { label: 'Settings',       href: '/admin/settings',       icon: 'settings' },
]

// ── Workspace nav ───────────────────────────────────────────────────────────

export function workspaceNav(slug: string): NavItem[] {
  return [
    { label: 'Dashboard', href: `/admin/org/${slug}/dashboard`, icon: 'space_dashboard' },
    { label: 'Projects',  href: `/admin/org/${slug}/projects`,  icon: 'rocket_launch' },
    { label: 'Agent',     href: `/admin/org/${slug}/agent`,     icon: 'smart_toy' },
    { label: 'Agent Board', href: `/admin/org/${slug}/agent/board`, icon: 'view_kanban' },
    { label: 'Brand',     href: `/admin/org/${slug}/brand`,     icon: 'palette' },
    { label: 'Team',      href: `/admin/org/${slug}/team`,      icon: 'groups' },
    { label: 'Billing',   href: `/admin/org/${slug}/billing`,   icon: 'payments' },
    { label: 'Activity',  href: `/admin/org/${slug}/activity`,  icon: 'pulse_alert' },
    { label: 'Settings',  href: `/admin/org/${slug}/settings`,  icon: 'settings' },
  ]
}

// ── Operator tools ──────────────────────────────────────────────────────────

export const OPERATOR_TOOLS: NavItem[] = [
  { label: 'Social',    href: '/admin/social',    icon: 'campaign' },
  { label: 'SEO',       href: '/admin/seo',        icon: 'trending_up' },
  { label: 'Email',     href: '/admin/email',      icon: 'mail' },
  { label: 'Sequences', href: '/admin/sequences',  icon: 'stacked_email' },
]

export const OPERATOR_TOOLS_TOPBAR: NavItem[] = [
  {
    label: 'Social', href: '/admin/social', icon: 'campaign',
    children: [
      { label: 'Overview',  href: '/admin/social' },
      { label: 'Compose',   href: '/admin/social/compose' },
      { label: 'Calendar',  href: '/admin/social/calendar' },
      { label: 'Queue',     href: '/admin/social/queue' },
      { label: 'Inbox',     href: '/admin/social/inbox' },
      { label: 'Accounts',  href: '/admin/social/accounts' },
      { label: 'Design',    href: '/admin/social/design' },
      { label: 'Links',     href: '/admin/social/links' },
    ],
  },
  { label: 'SEO', href: '/admin/seo', icon: 'trending_up' },
  {
    label: 'Email', href: '/admin/email', icon: 'mail',
    children: [
      { label: 'Overview',   href: '/admin/email' },
      { label: 'Compose',    href: '/admin/email/compose' },
      { label: 'Scheduled',  href: '/admin/email?folder=scheduled' },
      { label: 'Drafts',     href: '/admin/email?folder=drafts' },
      { label: 'Failed',     href: '/admin/email?folder=failed' },
    ],
  },
  { label: 'Sequences', href: '/admin/sequences', icon: 'stacked_email' },
]

// ── Workspace tools ─────────────────────────────────────────────────────────

export function workspaceTools(slug: string): NavItem[] {
  return [
    { label: 'Social Media',    href: `/admin/org/${slug}/social`,          icon: 'campaign' },
    { label: 'SEO Sprint',      href: `/admin/org/${slug}/seo`,             icon: 'trending_up' },
    { label: 'Email',           href: '/admin/email',                        icon: 'mail' },
    { label: 'Sequences',       href: '/admin/sequences',                    icon: 'stacked_email' },
    { label: 'Campaigns',       href: `/admin/org/${slug}/campaigns`,        icon: 'flag' },
    { label: 'Agent Control',    href: `/admin/org/${slug}/agent`,            icon: 'smart_toy' },
    { label: 'Capture Sources', href: `/admin/org/${slug}/capture-sources`,  icon: 'inventory_2' },
    { label: 'Integrations',    href: `/admin/org/${slug}/integrations`,     icon: 'extension' },
    { label: 'Email Domains',   href: `/admin/org/${slug}/email-domains`,    icon: 'dns' },
  ]
}

export function workspaceToolsTopbar(slug: string): NavItem[] {
  return [
    {
      label: 'Social Media', href: `/admin/org/${slug}/social`, icon: 'campaign',
      children: [
        { label: 'Overview',  href: `/admin/org/${slug}/social` },
        { label: 'Compose',   href: '/admin/social/compose' },
        { label: 'Calendar',  href: '/admin/social/calendar' },
        { label: 'Queue',     href: '/admin/social/queue' },
        { label: 'Inbox',     href: '/admin/social/inbox' },
        { label: 'Accounts',  href: '/admin/social/accounts' },
        { label: 'Design',    href: '/admin/social/design' },
        { label: 'Links',     href: '/admin/social/links' },
      ],
    },
    {
      label: 'SEO Sprint', href: `/admin/org/${slug}/seo`, icon: 'trending_up',
      children: [
        { label: 'Overview',       href: `/admin/org/${slug}/seo` },
        { label: 'Tasks',          href: `/admin/org/${slug}/seo/tasks` },
        { label: 'Keywords',       href: `/admin/org/${slug}/seo/keywords` },
        { label: 'Backlinks',      href: `/admin/org/${slug}/seo/backlinks` },
        { label: 'Content',        href: `/admin/org/${slug}/seo/content` },
        { label: 'Audits',         href: `/admin/org/${slug}/seo/audits` },
        { label: 'Optimisations',  href: `/admin/org/${slug}/seo/optimizations` },
        { label: 'Health',         href: `/admin/org/${slug}/seo/health` },
      ],
    },
    {
      label: 'Email', href: '/admin/email', icon: 'mail',
      children: [
        { label: 'Overview',   href: '/admin/email' },
        { label: 'Compose',    href: '/admin/email/compose' },
        { label: 'Scheduled',  href: '/admin/email?folder=scheduled' },
        { label: 'Drafts',     href: '/admin/email?folder=drafts' },
        { label: 'Failed',     href: '/admin/email?folder=failed' },
      ],
    },
    { label: 'Sequences', href: '/admin/sequences', icon: 'stacked_email' },
    { label: 'Agent Control', href: `/admin/org/${slug}/agent`, icon: 'smart_toy' },
    { label: 'Campaigns',       href: `/admin/org/${slug}/campaigns`,       icon: 'flag' },
    {
      label: 'Capture Sources', href: `/admin/org/${slug}/capture-sources`, icon: 'inventory_2',
      children: [
        { label: 'All sources', href: `/admin/org/${slug}/capture-sources` },
        { label: 'Import CSV',  href: `/admin/org/${slug}/capture-sources/import` },
      ],
    },
    { label: 'Integrations',  href: `/admin/org/${slug}/integrations`,  icon: 'extension' },
    { label: 'Email Domains', href: `/admin/org/${slug}/email-domains`, icon: 'dns' },
  ]
}
