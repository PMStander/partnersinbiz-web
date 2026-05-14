import { HubPage } from '@/components/navigation/HubPage'

export const dynamic = 'force-dynamic'

export default function AdminFinancePage() {
  return (
    <HubPage
      eyebrow="Admin hub"
      title="Finance"
      description="Keep invoices, recurring billing, quotes, and client payment work in one place."
      primaryAction={{
        label: 'New invoice',
        href: '/admin/invoicing/new',
        icon: 'add_card',
        description: 'Create an invoice.',
      }}
      sections={[
        {
          title: 'Billing operations',
          actions: [
            {
              label: 'Invoices',
              href: '/admin/invoicing',
              icon: 'receipt_long',
              description: 'View, send, edit, and reconcile client invoices.',
              eyebrow: 'AR',
            },
            {
              label: 'Recurring billing',
              href: '/admin/invoicing/recurring',
              icon: 'autorenew',
              description: 'Manage repeat invoice schedules and subscription-style billing.',
              eyebrow: 'Schedules',
            },
            {
              label: 'Quotes',
              href: '/admin/quotes',
              icon: 'request_quote',
              description: 'Create proposals and turn approved quotes into invoices.',
              eyebrow: 'Sales',
            },
          ],
        },
        {
          title: 'Related work',
          actions: [
            {
              label: 'Clients',
              href: '/admin/clients',
              icon: 'groups',
              description: 'Open client records before drilling into billing history.',
              eyebrow: 'Accounts',
            },
            {
              label: 'Reports',
              href: '/admin/reports',
              icon: 'analytics',
              description: 'Review client value and monthly reporting outputs.',
              eyebrow: 'Performance',
            },
            {
              label: 'Settings',
              href: '/admin/settings',
              icon: 'settings',
              description: 'Manage payment, API, and platform settings that affect finance flows.',
              eyebrow: 'Config',
            },
          ],
        },
      ]}
    />
  )
}
