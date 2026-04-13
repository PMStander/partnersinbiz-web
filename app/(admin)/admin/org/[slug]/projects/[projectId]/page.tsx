'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { TaskDetailPanel } from '@/components/kanban/TaskDetailPanel'

interface Column { id: string; name: string; color: string; order: number }
interface Task { id: string; title: string; description?: string; priority?: string; columnId: string; labels?: string[]; order: number }
interface ProjectDoc { id: string; title: string; content: string; type: 'brief' | 'requirements' | 'notes' | 'reference'; createdBy: string; updatedBy?: string; createdAt?: unknown; updatedAt?: unknown }
interface Project { id: string; name: string; description?: string; brief?: string; status?: string; columns: Column[] }

const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog',     name: 'Backlog',     color: 'var(--color-outline)',    order: 0 },
  { id: 'todo',        name: 'To Do',       color: '#60a5fa',                 order: 1 },
  { id: 'in_progress', name: 'In Progress', color: 'var(--color-accent-v2)', order: 2 },
  { id: 'review',      name: 'Review',      color: '#c084fc',                 order: 3 },
  { id: 'done',        name: 'Done',        color: '#4ade80',                 order: 4 },
]

const TYPE_COLORS: Record<string, string> = {
  brief: 'bg-amber-50 text-amber-700 border-amber-200',
  requirements: 'bg-blue-50 text-blue-700 border-blue-200',
  notes: 'bg-gray-50 text-gray-700 border-gray-200',
  reference: 'bg-purple-50 text-purple-700 border-purple-200',
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

export default function ProjectDetailPage() {
  const params = useParams()
  const slug = params.slug as string
  const projectId = params.projectId as string

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [docs, setDocs] = useState<ProjectDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showNewTask, setShowNewTask] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [activeTab, setActiveTab] = useState<'kanban' | 'docs' | 'settings'>('kanban')
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefValue, setBriefValue] = useState('')
  const [editingDoc, setEditingDoc] = useState<ProjectDoc | null>(null)
  const [savingBrief, setSavingBrief] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/v1/projects/${projectId}`).then(r => r.json()),
      fetch(`/api/v1/projects/${projectId}/tasks`).then(r => r.json()),
      fetch(`/api/v1/projects/${projectId}/docs`).then(r => r.json()),
    ]).then(([pBody, tBody, dBody]) => {
      setProject(pBody.data)
      setTasks(tBody.data ?? [])
      setDocs(dBody.data ?? [])
      setBriefValue(pBody.data?.brief ?? '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [projectId])

  const handleTaskMove = useCallback(async (taskId: string, newColumnId: string, newOrder: number) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, columnId: newColumnId, order: newOrder } : t))
    await fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: newColumnId, order: newOrder }),
    })
  }, [projectId])

  const handleTaskUpdate = useCallback(async (taskId: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))
    setSelectedTask(prev => prev?.id === taskId ? { ...prev, ...updates } as Task : prev)
    await fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
  }, [projectId])

  const handleTaskDelete = useCallback(async (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId))
    await fetch(`/api/v1/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' })
  }, [projectId])

  const handleSaveBrief = async () => {
    setSavingBrief(true)
    await fetch(`/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: briefValue }),
    })
    setProject(prev => prev ? { ...prev, brief: briefValue } : null)
    setEditingBrief(false)
    setSavingBrief(false)
  }

  const handleDeleteDoc = async (docId: string) => {
    if (!window.confirm('Are you sure?')) return
    await fetch(`/api/v1/projects/${projectId}/docs/${docId}`, { method: 'DELETE' })
    setDocs(prev => prev.filter(d => d.id !== docId))
  }

  const handleSaveDoc = async () => {
    if (!editingDoc?.title.trim() || !editingDoc?.content.trim()) return

    if (editingDoc.id) {
      await fetch(`/api/v1/projects/${projectId}/docs/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingDoc.title, content: editingDoc.content, type: editingDoc.type }),
      })
      setDocs(prev => prev.map(d => d.id === editingDoc.id ? editingDoc : d))
    } else {
      const res = await fetch(`/api/v1/projects/${projectId}/docs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editingDoc.title, content: editingDoc.content, type: editingDoc.type }),
      })
      const body = await res.json()
      if (body.data?.id) {
        setDocs(prev => [{ ...editingDoc, id: body.data.id } as ProjectDoc, ...prev])
      }
    }
    setEditingDoc(null)
  }

  async function handleAddTask(columnId: string) {
    if (!newTaskTitle.trim()) return
    const res = await fetch(`/api/v1/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTaskTitle.trim(), columnId, priority: 'medium', order: Date.now(), orgId: project?.id ?? '' }),
    })
    const body = await res.json()
    if (body.data?.id) {
      setTasks(prev => [...prev, { id: body.data.id, title: newTaskTitle.trim(), columnId, priority: 'medium', order: Date.now(), labels: [] }])
    }
    setNewTaskTitle('')
    setShowNewTask(null)
  }

  const columns = project?.columns?.length ? project.columns : DEFAULT_COLUMNS
  const selectedColumn = columns.find(c => c.id === selectedTask?.columnId)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-on-surface-variant mb-1">
            <Link href={`/admin/org/${slug}/projects`} className="hover:text-on-surface transition-colors">Projects</Link>
            <span>/</span>
            <span className="text-on-surface">{project?.name ?? '...'}</span>
          </div>
          <h1 className="text-2xl font-headline font-bold text-on-surface">
            {loading ? '...' : project?.name}
          </h1>
        </div>
        {activeTab === 'kanban' && (
          <button
            onClick={() => setShowNewTask('backlog')}
            className="pib-btn-primary text-sm font-label"
          >
            + Add Task
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-6 mb-6 shrink-0 border-b border-[var(--color-outline)]">
        <button
          onClick={() => setActiveTab('kanban')}
          className={`px-1 pb-3 text-sm font-label transition-colors ${
            activeTab === 'kanban'
              ? 'text-on-surface border-b-2 border-[var(--color-accent-v2)]'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Kanban
        </button>
        <button
          onClick={() => setActiveTab('docs')}
          className={`px-1 pb-3 text-sm font-label transition-colors ${
            activeTab === 'docs'
              ? 'text-on-surface border-b-2 border-[var(--color-accent-v2)]'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Docs
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-1 pb-3 text-sm font-label transition-colors ${
            activeTab === 'settings'
              ? 'text-on-surface border-b-2 border-[var(--color-accent-v2)]'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'kanban' && (
        <>
          {/* Quick add bar */}
          {showNewTask && (
            <div className="flex gap-2 mb-4 shrink-0">
              <input
                type="text"
                placeholder="Task title..."
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask(showNewTask); if (e.key === 'Escape') setShowNewTask(null) }}
                autoFocus
                className="flex-1 px-4 py-2 text-sm bg-[var(--color-card)] border border-[var(--color-accent-v2)] rounded-[var(--radius-btn)] text-on-surface placeholder:text-on-surface-variant focus:outline-none"
              />
              <button onClick={() => handleAddTask(showNewTask)} className="pib-btn-primary text-sm font-label">Add</button>
              <button onClick={() => setShowNewTask(null)} className="pib-btn-secondary text-sm font-label">Cancel</button>
            </div>
          )}

          {/* Board */}
          {loading ? (
            <div className="flex gap-4 overflow-x-auto">
              {DEFAULT_COLUMNS.map(c => (
                <div key={c.id} className="w-72 shrink-0 space-y-2">
                  <Skeleton className="h-6 w-24" />
                  {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <KanbanBoard
                columns={columns}
                tasks={tasks}
                projectId={projectId}
                onTaskMove={handleTaskMove}
                onTaskClick={setSelectedTask}
                onAddTask={(columnId) => setShowNewTask(columnId)}
              />
            </div>
          )}
        </>
      )}

      {activeTab === 'docs' && (
        <div className="flex-1 overflow-auto space-y-6">
          {/* Brief Section */}
          <div className="bg-[var(--color-card)] border border-[var(--color-outline)] rounded-lg p-4">
            <h2 className="text-lg font-headline font-bold text-on-surface mb-3">Project Brief</h2>
            {editingBrief ? (
              <div className="space-y-3">
                <textarea
                  value={briefValue}
                  onChange={e => setBriefValue(e.target.value)}
                  placeholder="Add a project brief... What's this project about? Goals, constraints, key stakeholders."
                  className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-[var(--color-accent-v2)]"
                  rows={4}
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveBrief} disabled={savingBrief} className="pib-btn-primary text-sm font-label">
                    {savingBrief ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => { setEditingBrief(false); setBriefValue(project?.brief ?? ''); }} className="pib-btn-secondary text-sm font-label">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className={`px-3 py-2 text-sm rounded min-h-[80px] ${briefValue ? 'bg-[var(--color-background)] text-on-surface' : 'bg-[var(--color-background)] text-on-surface-variant italic'}`}>
                  {briefValue || 'No brief yet'}
                </p>
                <button onClick={() => setEditingBrief(true)} className="pib-btn-secondary text-sm font-label">Edit</button>
              </div>
            )}
          </div>

          {/* Documents Section */}
          <div className="bg-[var(--color-card)] border border-[var(--color-outline)] rounded-lg p-4">
            <h2 className="text-lg font-headline font-bold text-on-surface mb-4">Documents</h2>
            {editingDoc ? (
              <div className="space-y-3 mb-4">
                <input
                  type="text"
                  placeholder="Document title..."
                  value={editingDoc.title}
                  onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface focus:outline-none focus:border-[var(--color-accent-v2)]"
                />
                <select
                  value={editingDoc.type}
                  onChange={e => setEditingDoc({ ...editingDoc, type: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface focus:outline-none focus:border-[var(--color-accent-v2)]"
                >
                  <option value="brief">Brief</option>
                  <option value="requirements">Requirements</option>
                  <option value="notes">Notes</option>
                  <option value="reference">Reference</option>
                </select>
                <textarea
                  placeholder="Content (markdown)..."
                  value={editingDoc.content}
                  onChange={e => setEditingDoc({ ...editingDoc, content: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-[var(--color-accent-v2)]"
                  rows={10}
                />
                <div className="flex gap-2">
                  <button onClick={handleSaveDoc} className="pib-btn-primary text-sm font-label">Save</button>
                  <button onClick={() => setEditingDoc(null)} className="pib-btn-secondary text-sm font-label">Cancel</button>
                </div>
              </div>
            ) : null}

            {!editingDoc && (
              <>
                <div className="space-y-2 mb-4">
                  {docs.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-[var(--color-background)] border border-[var(--color-outline)] rounded">
                      <div className="flex-1 flex items-center gap-3">
                        <span className="text-lg">📄</span>
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{doc.title}</p>
                          <span className={`inline-block text-xs px-2 py-1 rounded border mt-1 ${TYPE_COLORS[doc.type] || TYPE_COLORS.notes}`}>
                            {doc.type}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingDoc(doc)} className="pib-btn-secondary text-xs font-label">Edit</button>
                        <button onClick={() => handleDeleteDoc(doc.id!)} className="text-xs text-red-600 hover:text-red-700">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setEditingDoc({ id: '', title: '', content: '', type: 'notes', createdBy: '' })}
                  className="w-full pib-btn-secondary text-sm font-label"
                >
                  + New Document
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="flex-1 overflow-auto max-w-2xl">
          <div className="bg-[var(--color-card)] border border-[var(--color-outline)] rounded-lg p-6 space-y-6">
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Project Name</label>
              <input
                type="text"
                defaultValue={project?.name}
                className="w-full px-4 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface focus:outline-none focus:border-[var(--color-accent-v2)]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Status</label>
              <select
                defaultValue={project?.status}
                className="w-full px-4 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface focus:outline-none focus:border-[var(--color-accent-v2)]"
              >
                <option value="discovery">Discovery</option>
                <option value="design">Design</option>
                <option value="development">Development</option>
                <option value="review">Review</option>
                <option value="live">Live</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-on-surface mb-2">Description</label>
              <textarea
                defaultValue={project?.description}
                className="w-full px-4 py-2 text-sm bg-[var(--color-background)] border border-[var(--color-outline)] rounded text-on-surface focus:outline-none focus:border-[var(--color-accent-v2)]"
                rows={4}
              />
            </div>
            <button className="pib-btn-primary text-sm font-label">Save Settings</button>
          </div>
        </div>
      )}

      {/* Task detail panel */}
      {selectedTask && activeTab === 'kanban' && (
        <TaskDetailPanel
          task={selectedTask}
          columnName={selectedColumn?.name ?? ''}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskDelete}
        />
      )}
    </div>
  )
}
