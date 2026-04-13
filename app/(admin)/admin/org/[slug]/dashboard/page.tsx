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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch projects for this org via slug
    fetch(`/api/v1/projects?orgSlug=${slug}`)
      .then(r => r.json())
      .then(body => {
        setProjects(body.data ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
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
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Active</p>
              <p className="text-3xl font-headline font-bold text-on-surface">{activeProjects.length}</p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Posts Pending</p>
              <p className="text-3xl font-headline font-bold text-on-surface">—</p>
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
