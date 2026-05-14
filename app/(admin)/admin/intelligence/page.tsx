import { HubPage } from '@/components/navigation/HubPage'

export const dynamic = 'force-dynamic'

export default function AdminIntelligencePage() {
  return (
    <HubPage
      eyebrow="Admin hub"
      title="Intelligence"
      description="Understand product usage, marketing sites, reports, and communication performance without crowding the main nav."
      primaryAction={{
        label: 'Open analytics',
        href: '/admin/analytics',
        icon: 'analytics',
        description: 'Open analytics.',
      }}
      sections={[
        {
          title: 'Data surfaces',
          actions: [
            {
              label: 'Analytics',
              href: '/admin/analytics',
              icon: 'analytics',
              description: 'Inspect events, sessions, users, funnels, retention, and live activity.',
              eyebrow: 'Product',
            },
            {
              label: 'Properties',
              href: '/admin/properties',
              icon: 'apartment',
              description: 'Manage connected marketing sites, apps, runtime config, and ingest keys.',
              eyebrow: 'Sites',
            },
            {
              label: 'Reports',
              href: '/admin/reports',
              icon: 'monitoring',
              description: 'Review generated client reporting and shareable performance outputs.',
              eyebrow: 'Client value',
            },
          ],
        },
        {
          title: 'Marketing performance',
          actions: [
            {
              label: 'Email analytics',
              href: '/admin/email-analytics',
              icon: 'mark_email_read',
              description: 'Track broadcast and sequence engagement.',
              eyebrow: 'Email',
            },
            {
              label: 'Social analytics',
              href: '/admin/social/analytics',
              icon: 'query_stats',
              description: 'Review performance across posts and platforms.',
              eyebrow: 'Social',
            },
            {
              label: 'SEO tools',
              href: '/admin/seo/tools',
              icon: 'travel_explore',
              description: 'Use search and optimisation utilities that support SEO sprints.',
              eyebrow: 'Search',
            },
          ],
        },
      ]}
    />
  )
}
