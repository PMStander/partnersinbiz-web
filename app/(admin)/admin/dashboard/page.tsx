'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { StatCardWithChart, RevenueBarChart, DonutChart, TrendAreaChart } from '@/components/ui/Charts'

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

interface PendingApproval {
  id: string
  content: string
  platform: string
  orgId: string
  orgName: string
  scheduledAt: any
}

const ACTIVITY_ICONS: Record<string, string> = {
  email_sent: '✉',
  note: '◻',
  stage_change: '→',
  sequence_enrolled: '◈',
  call: '◉',
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

// ── Activity Item ─────────────────────────────────────────────────────────

function ActivityItem({ item }: { item: Activity }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-[var(--color-row-hover)] transition-colors cursor-default">
      <span
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm"
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

// ── Approval Item ────────────────────────────────────────────────────────

function ApprovalItem({ item }: { item: PendingApproval }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-lg hover:bg-[var(--color-row-hover)] transition-colors">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5"
        style={{ background: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
      >
        {item.platform[0]?.toUpperCase() || '·'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-on-surface-variant uppercase tracking-wide">{item.orgName}</p>
        <p className="text-sm text-on-surface truncate mt-0.5">{item.content}</p>
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

// ── Main Page ─────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<Activity[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/dashboard/stats').then((r) => r.json()),
      fetch('/api/v1/dashboard/activity?limit=10').then((r) => r.json()),
      fetch('/api/v1/social/posts/pending?limit=5').then((r) => r.json()),
    ]).then(([statsBody, activityBody, approvalsBody]) => {
      setStats(statsBody.data)
      setActivity(activityBody.data ?? [])
      setPendingApprovals(approvalsBody.data ?? [])
      setLoading(false)
    })
  }, [])

  const openRate =
    stats && stats.email.sent > 0
      ? Math.round((stats.email.opened / stats.email.sent) * 100)
      : 0

  // Weekly sparkline data
  const pipelineWeekly = [12000, 15000, 11000, 18000, 14000, 22000, stats?.deals.pipelineValue ?? 0]
  const contactsWeekly = [30, 35, 38, 40, 44, 48, stats?.contacts.total ?? 0]

  // Revenue bar chart data (daily)
  const revenueData = DAY_LABELS.map((label, i) => ({
    label,
    value: pipelineWeekly[i] ?? 0,
  }))

  // Contact growth area chart
  const contactGrowthData = DAY_LABELS.map((label, i) => ({
    label,
    value: contactsWeekly[i] ?? 0,
  }))

  // Deals by stage donut
  const dealsDonut = [
    { name: 'Won', value: stats?.deals.wonValue ? Math.round(stats.deals.wonValue / 1000) : 3 },
    { name: 'Pipeline', value: stats?.deals.pipelineValue ? Math.round(stats.deals.pipelineValue / 1000) : 8 },
    { name: 'Pending', value: stats?.deals.total ?? 5 },
  ]

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ── Header with greeting ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
            Dashboard
          </p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">
            {getGreeting()}, Peet
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="pib-stat-card !py-2 !px-4 flex items-center gap-3">
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
              Active Deals
            </span>
            <span className="text-lg font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>
              {stats?.deals.total ?? '—'}
            </span>
          </div>
          <Link href="/admin/crm/contacts" className="pib-btn-primary text-sm font-label">
            + New Contact
          </Link>
        </div>
      </div>

      {/* ── Stat Cards Row ── */}
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
            <Link href="/admin/crm/pipeline" className="block">
              <StatCardWithChart
                label="Pipeline Value"
                value={`$${(stats?.deals.pipelineValue ?? 0).toLocaleString()}`}
                sub={`$${(stats?.deals.wonValue ?? 0).toLocaleString()} won`}
                trend="up"
                accent
                data={pipelineWeekly.map(v => ({ value: v }))}
                chartType="bar"
              />
            </Link>
            <Link href="/admin/crm/contacts" className="block">
              <StatCardWithChart
                label="Contacts"
                value={stats?.contacts.total ?? 0}
                sub="in CRM"
                trend="up"
                data={contactsWeekly.map(v => ({ value: v }))}
                chartType="area"
              />
            </Link>
            <Link href="/admin/email" className="block">
              <StatCardWithChart
                label="Emails Sent"
                value={stats?.email.sent ?? 0}
                sub={`${openRate}% open rate`}
              />
            </Link>
            <Link href="/admin/sequences" className="block">
              <StatCardWithChart
                label="Active Sequences"
                value={stats?.sequences.active ?? 0}
                sub={`${stats?.sequences.activeEnrollments ?? 0} enrolled`}
              />
            </Link>
          </>
        )}
      </div>

      {/* ── Charts Row: Revenue + Deals Donut ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue / Pipeline Bar Chart */}
        <div className="lg:col-span-2 pib-card space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Revenue</p>
              <p className="text-xl font-headline font-bold text-on-surface mt-0.5">
                ${(stats?.deals.pipelineValue ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1">
                <span className="text-green-400">2.5% ↑</span> vs last week
              </p>
            </div>
            <span className="text-[10px] text-on-surface-variant bg-[var(--color-surface-container)] px-2 py-1 rounded">
              This week
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-[250px]" />
          ) : (
            <RevenueBarChart
              data={revenueData}
              target={9340}
              valueFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
              highlightLast
            />
          )}
        </div>

        {/* Deals by Stage Donut */}
        <div className="pib-card space-y-2">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
            Deals by Stage
          </p>
          {loading ? (
            <Skeleton className="h-[220px]" />
          ) : (
            <DonutChart
              data={dealsDonut}
              centerValue={stats?.deals.total ?? 0}
              centerLabel="Total"
            />
          )}
        </div>
      </div>

      {/* ── Contact Growth Area Chart ── */}
      <div className="pib-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Contact Growth</p>
            <p className="text-xl font-headline font-bold text-on-surface mt-0.5">
              {stats?.contacts.total ?? 0} total
            </p>
          </div>
          <span className="text-[10px] text-on-surface-variant bg-[var(--color-surface-container)] px-2 py-1 rounded">
            Last 7 days
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-[180px]" />
        ) : (
          <TrendAreaChart data={contactGrowthData} height={180} />
        )}
      </div>

      {/* ── Approvals + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Approvals */}
        <div className="pib-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">
                Pending Approvals
              </p>
              {pendingApprovals.length > 0 && (
                <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center bg-[var(--color-accent-v2)] text-black">
                  {pendingApprovals.length}
                </span>
              )}
            </div>
            <Link
              href="/admin/social/queue"
              className="text-[10px] font-label uppercase tracking-wide"
              style={{ color: 'var(--color-accent-v2)' }}
            >
              View all →
            </Link>
          </div>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : pendingApprovals.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-2xl mb-2">&#127881;</p>
              <p className="text-sm text-on-surface-variant">No posts pending approval</p>
            </div>
          ) : (
            <div className="space-y-1 -mx-4">
              {pendingApprovals.map((item) => (
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
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : activity.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-on-surface-variant">No activity yet.</p>
            </div>
          ) : (
            <div className="space-y-0.5 -mx-4">
              {activity.map((item) => <ActivityItem key={item.id} item={item} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="pib-card">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">
          Quick Actions
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'New Contact',    href: '/admin/crm/contacts' },
            { label: 'Compose Post',   href: '/admin/social/compose' },
            { label: 'Send Email',     href: '/admin/email/compose' },
            { label: 'View Pipeline',  href: '/admin/crm/pipeline' },
            { label: 'Manage Clients', href: '/admin/clients' },
            { label: 'Analytics',      href: '/admin/social/analytics' },
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
