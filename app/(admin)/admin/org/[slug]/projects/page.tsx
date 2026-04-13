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

const STATUS_OPTIONS = ['discovery', 'design', 'development', 'review', 'live', 'maintenance']

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

  // New project form state
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formStatus, setFormStatus] = useState('discovery')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v1/projects?orgSlug=${slug}`)
      .then(r => r.json())
      .then(body => { setProjects(body.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return

    try {
      setFormError(null)
      setFormLoading(true)

      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          orgSlug: slug,
          status: formStatus,
        }),
      })

      const body = await res.json()

      if (!res.ok) {
        throw new Error(body.error || 'Failed to create project')
      }

      // Add new project to list
      const newProject: Project = {
        id: body.data.id,
        name: formName,
        status: formStatus,
      }
      setProjects([newProject, ...projects])
      setShowForm(false)
      setFormName('')
      setFormStatus('discovery')
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'An error occurred')
    } finally {
      setFormLoading(false)
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setFormName('')
    setFormStatus('discovery')
    setFormError(null)
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Projects</p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Projects</h1>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="pib-btn-primary text-sm font-label"
          >
            + New Project
          </button>
        )}
      </div>

      {/* New Project Form */}
      {showForm && (
        <div className="pib-card p-4">
          <form onSubmit={handleCreateProject} className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <input
                type="text"
                placeholder="Project name…"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
                disabled={formLoading}
                autoFocus
              />
            </div>
            <select
              value={formStatus}
              onChange={(e) => setFormStatus(e.target.value)}
              className="px-3 py-2 rounded-md text-sm"
              style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-outline)' }}
              disabled={formLoading}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <button
              type="submit"
              className="pib-btn-primary text-sm font-label"
              disabled={formLoading || !formName.trim()}
            >
              {formLoading ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="pib-btn-secondary text-sm font-label"
              disabled={formLoading}
            >
              Cancel
            </button>
          </form>
          {formError && (
            <p className="text-xs text-[#ef4444] mt-2">{formError}</p>
          )}
        </div>
      )}

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
