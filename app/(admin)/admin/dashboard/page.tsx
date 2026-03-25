'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Stats {
  contacts: { total: number }
  deals: { total: number; pipelineValue: number; wonValue: number }
  email: { sent: number; opened: number }
  sequences: { active: number; activeEnrollments: number }
}

interface Activity {
  id: string
  type: string
  contactId: string
  note: string
  createdAt: any
}

const ACTIVITY_ICONS: Record<string, string> = {
  email_sent: '✉️',
  note: '📝',
  stage_change: '🔄',
  sequence_enrolled: '📋',
  call: '📞',
}

function StatCard({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const content = (
    <div className="p-5 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors">
      <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-on-surface">{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-1">{sub}</p>}
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/dashboard/stats').then((r) => r.json()),
      fetch('/api/v1/dashboard/activity?limit=15').then((r) => r.json()),
    ]).then(([statsBody, activityBody]) => {
      setStats(statsBody.data)
      setActivity(activityBody.data ?? [])
      setLoading(false)
    })
  }, [])

  const openRate = stats && stats.email.sent > 0
    ? Math.round((stats.email.opened / stats.email.sent) * 100)
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Dashboard</h1>
        <p className="text-sm text-on-surface-variant mt-1">Overview of your business</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Contacts"
              value={stats.contacts.total}
              href="/admin/crm/contacts"
            />
            <StatCard
              label="Pipeline Value"
              value={`$${stats.deals.pipelineValue.toLocaleString()}`}
              sub={`$${stats.deals.wonValue.toLocaleString()} won`}
              href="/admin/crm/pipeline"
            />
            <StatCard
              label="Emails Sent"
              value={stats.email.sent}
              sub={`${openRate}% open rate`}
              href="/admin/email"
            />
            <StatCard
              label="Active Sequences"
              value={stats.sequences.active}
              sub={`${stats.sequences.activeEnrollments} enrolled`}
              href="/admin/sequences"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'CRM Contacts', href: '/admin/crm/contacts' },
              { label: 'Pipeline', href: '/admin/crm/pipeline' },
              { label: 'Email Inbox', href: '/admin/email' },
              { label: 'Sequences', href: '/admin/sequences' },
              { label: 'Compose Email', href: '/admin/email/compose' },
              { label: 'Marketing', href: '/admin/marketing' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-4 py-3 rounded-xl bg-surface-container text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors text-center"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Recent Activity</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-on-surface-variant text-sm text-center py-8">No activity yet.</p>
        ) : (
          <div className="space-y-1">
            {activity.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-surface-container transition-colors">
                <span className="text-base flex-shrink-0">{ACTIVITY_ICONS[item.type] ?? '•'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface truncate">{item.note}</p>
                </div>
                <span className="text-xs text-on-surface-variant flex-shrink-0 capitalize">{item.type.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
