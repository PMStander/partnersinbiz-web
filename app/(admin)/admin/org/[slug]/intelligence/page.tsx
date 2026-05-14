'use client'

import { useParams } from 'next/navigation'
import { HubPage } from '@/components/navigation/HubPage'

export const dynamic = 'force-dynamic'

export default function OrgIntelligencePage() {
  const params = useParams()
  const slug = params.slug as string

  return (
    <HubPage
      eyebrow="Client workspace"
      title="Reports"
      description="Client performance, activity, analytics, properties, and reporting shortcuts."
      primaryAction={{
        label: 'Open activity',
        href: `/admin/org/${slug}/activity`,
        icon: 'pulse_alert',
        description: 'Open activity.',
      }}
      sections={[
        {
          title: 'Client signals',
          actions: [
            {
              label: 'Workspace dashboard',
              href: `/admin/org/${slug}/dashboard`,
              icon: 'space_dashboard',
              description: 'Review the client overview, project state, and publishing trend.',
              eyebrow: 'Overview',
            },
            {
              label: 'Activity',
              href: `/admin/org/${slug}/activity`,
              icon: 'pulse_alert',
              description: 'See recent client actions and operational events.',
              eyebrow: 'Timeline',
            },
            {
              label: 'Reports',
              href: '/admin/reports',
              icon: 'monitoring',
              description: 'Open generated performance reports and shareable outputs.',
              eyebrow: 'Monthly',
            },
          ],
        },
        {
          title: 'Analytics tools',
          actions: [
            {
              label: 'Analytics',
              href: '/admin/analytics',
              icon: 'analytics',
              description: 'Inspect sessions, events, users, funnels, retention, and live traffic.',
              eyebrow: 'Product',
            },
            {
              label: 'Properties',
              href: '/admin/properties',
              icon: 'apartment',
              description: 'Manage connected sites and runtime configuration.',
              eyebrow: 'Sites',
            },
            {
              label: 'Email analytics',
              href: '/admin/email-analytics',
              icon: 'mark_email_read',
              description: 'Review email performance across broadcasts and sequences.',
              eyebrow: 'Comms',
            },
          ],
        },
      ]}
    />
  )
}
