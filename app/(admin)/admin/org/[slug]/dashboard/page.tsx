'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Project {
  id: string
  name: string
  status: string
  description?: string
  updatedAt?: any
}

interface SocialStats {
  total: number
  byStatus: {
    draft: number
    pending_approval: number
    approved: number
    scheduled: number
    published: number
    failed: number
    cancelled: number
  }
  byPlatform: Record<string, number>
  approvalRate: number
  last30Days: number
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    active:     { label: 'Active',     color: 'var(--color-accent-v2)' },
    on_hold:    { label: 'On Hold',    color: 'var(--color-secondary)' },
    completed:  { label: 'Completed',  color: '#4ade80' },
    archived:   { label: 'Archived',   color: 'var(--color-outline)' },
    in_progress:{ label: 'In Progress', color: 'var(--color-accent-v2)' },
  }
  const s = map[status] ?? { label: status, color: 'var(--color-outline)' }
  return (
    <span
      className="text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: `${s.color}20`, color: s.color }}
    >
      {s.label}
    </span>
  )
}

export default function OrgDashboard() {
  const params = useParams()
  const slug = params.slug as string

  const [projects, setProjects] = useState<Project[]>([])
  const [socialStats, setSocialStats] = useState<SocialStats | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch org ID, projects, and social stats
    Promise.all([
      fetch(`/api/v1/organizations`)
        .then(r => r.json())
        .then(body => {
          const org = (body.data ?? []).find((o: any) => o.slug === slug)
          if (org) {
            setOrgId(org.id)
            return org.id
          }
          return null
        }),
      fetch(`/api/v1/projects?orgSlug=${slug}`)
        .then(r => r.json())
        .then(body => {
          setProjects(body.data ?? [])
        }),
    ])
      .then(([fetchedOrgId]) => {
        // Fetch social stats if we have an orgId
        if (fetchedOrgId) {
          return fetch(`/api/v1/social/stats?orgId=${fetchedOrgId}`)
            .then(r => r.json())
            .then(body => {
              setSocialStats(body.data ?? null)
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'in_progress')

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">
            Workspace
          </p>
          <h1 className="text-2xl font-headline font-bold text-on-surface capitalize">
            {slug.replace(/-/g, ' ')}
          </h1>
        </div>
        <Link href={`/admin/org/${slug}/projects`} className="pib-btn-primary text-sm font-label">
          + New Project
        </Link>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)
        ) : (
          <>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Projects</p>
              <p className="text-3xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>{projects.length}</p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Posts Published</p>
              <p className="text-3xl font-headline font-bold text-on-surface">{socialStats?.byStatus.published ?? 0}</p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Pending Approval</p>
              <p className="text-3xl font-headline font-bold" style={{ color: (socialStats?.byStatus.pending_approval ?? 0) > 0 ? 'var(--color-accent-v2)' : 'var(--color-on-surface)' }}>
                {socialStats?.byStatus.pending_approval ?? 0}
              </p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Invoices Due</p>
              <p className="text-3xl font-headline font-bold text-on-surface">—</p>
            </div>
          </>
        )}
      </div>

      {/* Projects List */}
      <div className="pib-card space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Projects</p>
          <Link
            href={`/admin/org/${slug}/projects`}
            className="text-[10px] font-label uppercase tracking-wide"
            style={{ color: 'var(--color-accent-v2)' }}
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-on-surface-variant text-sm">No projects yet.</p>
            <Link
              href={`/admin/org/${slug}/projects`}
              className="text-sm mt-2 inline-block"
              style={{ color: 'var(--color-accent-v2)' }}
            >
              Create the first one →
            </Link>
          </div>
        ) : (
          <div className="space-y-1 -mx-6">
            {projects.slice(0, 6).map((project) => (
              <Link
                key={project.id}
                href={`/admin/org/${slug}/projects/${project.id}`}
                className="flex items-center gap-4 px-6 py-3 hover:bg-[var(--color-row-hover)] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface truncate">{project.name}</p>
                  {project.description && (
                    <p className="text-xs text-on-surface-variant truncate mt-0.5">{project.description}</p>
                  )}
                </div>
                <StatusBadge status={project.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Social Overview */}
      {!loading && socialStats && (
        <div className="pib-card space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Social Overview</p>
            <Link
              href={`/admin/org/${slug}/social`}
              className="text-[10px] font-label uppercase tracking-wide"
              style={{ color: 'var(--color-accent-v2)' }}
            >
              View Social →
            </Link>
          </div>

          {/* Stats pills */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-headline font-bold text-on-surface">{socialStats.byStatus.published}</span>
              <span className="text-xs text-on-surface-variant">Published</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-headline font-bold text-on-surface">{socialStats.byStatus.scheduled}</span>
              <span className="text-xs text-on-surface-variant">Scheduled</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span
                className="text-lg font-headline font-bold"
                style={{ color: socialStats.byStatus.pending_approval > 0 ? 'var(--color-accent-v2)' : 'var(--color-on-surface)' }}
              >
                {socialStats.byStatus.pending_approval}
              </span>
              <span className="text-xs text-on-surface-variant">Pending</span>
            </div>
          </div>

          {/* Platform breakdown */}
          {Object.keys(socialStats.byPlatform).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--color-card-border)]">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Platform Breakdown</p>
              {Object.entries(socialStats.byPlatform).map(([platform, count]) => {
                const percentage = socialStats.total > 0 ? (count / socialStats.total) * 100 : 0
                return (
                  <div key={platform} className="flex items-center gap-3">
                    <span className="text-xs w-20 text-on-surface-variant capitalize">{platform}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-outline-variant overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, background: 'var(--color-accent-v2)' }}
                      />
                    </div>
                    <span className="text-xs text-on-surface-variant w-8 text-right">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Quick Links */}
      <div className="pib-card">
        <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: 'Projects', href: `/admin/org/${slug}/projects` },
            { label: 'Social Queue', href: '/admin/social/queue' },
            { label: 'Compose Post', href: '/admin/social/compose' },
            { label: 'Team', href: `/admin/org/${slug}/team` },
            { label: 'Billing', href: `/admin/org/${slug}/billing` },
          ].map(a => (
            <Link key={a.href} href={a.href} className="pib-btn-secondary text-xs font-label">{a.label}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}
