'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────

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
  email_sent: '✉',
  note: '◻',
  stage_change: '→',
  sequence_enrolled: '◈',
  call: '◉',
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

// ── Metric Card ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  trend,
  accent,
  href,
}: {
  label: string
  value: string | number
  sub?: string
  trend?: 'up' | 'down'
  accent?: boolean
  href?: string
}) {
  const inner = (
    <div
      className="pib-card pib-card-hover h-full"
      style={accent ? { borderColor: 'var(--color-accent-subtle)' } : {}}
    >
      <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">
        {label}
      </p>
      <p
        className="text-3xl font-headline font-bold mb-1"
        style={{ color: accent ? 'var(--color-accent-v2)' : 'var(--color-on-surface)' }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-xs text-on-surface-variant flex items-center gap-1">
          {trend === 'up' && <span className="text-green-400 text-xs">↑</span>}
          {trend === 'down' && <span className="text-red-400 text-xs">↓</span>}
          {sub}
        </p>
      )}
    </div>
  )
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner
}

// ── Activity Item ─────────────────────────────────────────────────────────

function ActivityItem({ item }: { item: Activity }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-[var(--radius-btn)] hover:bg-[var(--color-row-hover)] transition-colors cursor-default">
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm"
        style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
      >
        {ACTIVITY_ICONS[item.type] ?? '·'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-on-surface truncate">{item.note}</p>
      </div>
      <span className="text-[10px] text-on-surface-variant uppercase tracking-wide shrink-0">
        {item.type.replace(/_/g, ' ')}
      </span>
    </div>
  )
}

// ── Approval Item (placeholder data) ─────────────────────────────────────

const MOCK_APPROVALS = [
  { id: '1', org: 'Batavia Wrestling', platform: 'X', preview: 'Season starts Monday! Come watch the...' },
  { id: '2', org: 'GoHawk Wrestling', platform: 'LinkedIn', preview: 'We are proud to announce our new head coach...' },
]

function ApprovalItem({ item }: { item: typeof MOCK_APPROVALS[0] }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-[var(--radius-btn)] hover:bg-[var(--color-row-hover)] transition-colors">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5"
        style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
      >
        {item.platform[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">{item.org}</p>
        <p className="text-sm text-on-surface truncate mt-0.5">{item.preview}</p>
      </div>
      <Link
        href="/admin/social/queue"
        className="text-[10px] font-label uppercase tracking-wide shrink-0 mt-1"
        style={{ color: 'var(--color-accent-v2)' }}
      >
        Review →
      </Link>
    </div>
  )
}

// ── Mini Bar Chart (pure CSS — no library needed) ─────────────────────────

function MiniBarChart({ data }: { data: number[] }) {
  const max = Math.max(...data, 1)
  return (
    <div className="flex items-end gap-1 h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all duration-300"
          style={{
            height: `${(v / max) * 100}%`,
            minHeight: 2,
            background: i === data.length - 1
              ? 'var(--color-accent-v2)'
              : 'var(--color-surface-container-high)',
          }}
        />
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/dashboard/stats').then((r) => r.json()),
      fetch('/api/v1/dashboard/activity?limit=10').then((r) => r.json()),
    ]).then(([statsBody, activityBody]) => {
      setStats(statsBody.data)
      setActivity(activityBody.data ?? [])
      setLoading(false)
    })
  }, [])

  const openRate =
    stats && stats.email.sent > 0
      ? Math.round((stats.email.opened / stats.email.sent) * 100)
      : 0

  // Mock weekly data for sparklines
  const pipelineSparkline = [12000, 15000, 11000, 18000, 14000, 22000, stats?.deals.pipelineValue ?? 0]
  const contactsSparkline = [30, 35, 38, 40, 44, 48, stats?.contacts.total ?? 0]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Command Center</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          href="/admin/crm/contacts"
          className="pib-btn-primary text-sm font-label"
        >
          + New Contact
        </Link>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <MetricCard
              label="Pipeline Value"
              value={`$${(stats?.deals.pipelineValue ?? 0).toLocaleString()}`}
              sub={`$${(stats?.deals.wonValue ?? 0).toLocaleString()} won`}
              trend="up"
              accent
              href="/admin/crm/pipeline"
            />
            <MetricCard
              label="Contacts"
              value={stats?.contacts.total ?? 0}
              sub="in CRM"
              href="/admin/crm/contacts"
            />
            <MetricCard
              label="Emails Sent"
              value={stats?.email.sent ?? 0}
              sub={`${openRate}% open rate`}
              href="/admin/email"
            />
            <MetricCard
              label="Active Sequences"
              value={stats?.sequences.active ?? 0}
              sub={`${stats?.sequences.activeEnrollments ?? 0} enrolled`}
              href="/admin/sequences"
            />
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline trend */}
        <div className="lg:col-span-2 pib-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Pipeline Trend</p>
              <p className="text-lg font-headline font-bold text-on-surface mt-0.5">
                ${(stats?.deals.pipelineValue ?? 0).toLocaleString()}
              </p>
            </div>
            <span className="text-[10px] text-on-surface-variant">Last 7 weeks</span>
          </div>
          {loading ? <Skeleton className="h-16" /> : <MiniBarChart data={pipelineSparkline} />}
        </div>

        {/* Contacts growth */}
        <div className="pib-card space-y-4">
          <div>
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Contact Growth</p>
            <p className="text-lg font-headline font-bold text-on-surface mt-0.5">
              {stats?.contacts.total ?? 0} total
            </p>
          </div>
          {loading ? <Skeleton className="h-16" /> : <MiniBarChart data={contactsSparkline} />}
        </div>
      </div>

      {/* Bottom Row: Approvals + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Pending Approvals */}
        <div className="pib-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Pending Approvals
            </p>
            <Link
              href="/admin/social/queue"
              className="text-[10px] font-label uppercase tracking-wide"
              style={{ color: 'var(--color-accent-v2)' }}
            >
              View all →
            </Link>
          </div>
          {MOCK_APPROVALS.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">All clear 🎉</p>
          ) : (
            <div className="space-y-1 -mx-4">
              {MOCK_APPROVALS.map((item) => (
                <ApprovalItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="pib-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Recent Activity
            </p>
            <Link
              href="/admin/crm/contacts"
              className="text-[10px] font-label uppercase tracking-wide"
              style={{ color: 'var(--color-accent-v2)' }}
            >
              View CRM →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : activity.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">No activity yet.</p>
          ) : (
            <div className="space-y-0.5 -mx-4">
              {activity.map((item) => <ActivityItem key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="pib-card">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">
          Quick Actions
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'New Contact', href: '/admin/crm/contacts' },
            { label: 'Compose Post', href: '/admin/social/compose' },
            { label: 'Send Email', href: '/admin/email/compose' },
            { label: 'View Pipeline', href: '/admin/crm/pipeline' },
            { label: 'Manage Clients', href: '/admin/clients' },
          ].map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="pib-btn-secondary text-xs font-label"
            >
              {action.label}
            </Link>
          ))}
        </div>
      </div>

    </div>
  )
}
