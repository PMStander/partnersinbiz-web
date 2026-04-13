'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Project {
  id: string
  name: string
  status: string
  description?: string
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

const STATUS_OPTIONS = ['active', 'on_hold', 'completed', 'archived']

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    active:      { label: 'Active',      color: 'var(--color-accent-v2)' },
    on_hold:     { label: 'On Hold',     color: 'var(--color-secondary)' },
    completed:   { label: 'Completed',   color: '#4ade80' },
    archived:    { label: 'Archived',    color: 'var(--color-outline)' },
    in_progress: { label: 'In Progress', color: 'var(--color-accent-v2)' },
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

export default function ProjectsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetch(`/api/v1/projects?orgSlug=${slug}`)
      .then(r => r.json())
      .then(body => { setProjects(body.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Projects</p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Projects</h1>
        </div>
        <button className="pib-btn-primary text-sm font-label">+ New Project</button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...STATUS_OPTIONS].map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={[
              'text-xs font-label px-3 py-1.5 rounded-[var(--radius-btn)] transition-colors capitalize',
              filter === s
                ? 'text-black font-medium'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
            ].join(' ')}
            style={filter === s ? { background: 'var(--color-accent-v2)' } : {}}
          >
            {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="pib-card py-12 text-center">
          <p className="text-on-surface-variant text-sm">No projects found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(project => (
            <Link
              key={project.id}
              href={`/admin/org/${slug}/projects/${project.id}`}
              className="pib-card pib-card-hover block"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-medium text-on-surface">{project.name}</h3>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <p className="text-sm text-on-surface-variant line-clamp-2">{project.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
