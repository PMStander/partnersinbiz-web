'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'

type SocialPlatform = 'x' | 'linkedin'
type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

const CATEGORIES: SocialPostCategory[] = ['work', 'personal', 'ai', 'sport', 'sa', 'other']

interface SocialPost {
  id: string
  platform: SocialPlatform
  content: string
  threadParts: string[]
  scheduledFor: any
  status: SocialPostStatus
  publishedAt: any | null
  externalId: string | null
  error: string | null
  category: SocialPostCategory
  tags: string[]
  createdBy: string
  createdAt: any
  updatedAt: any
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function fmtDateTime(ts: any) {
  const d = tsToDate(ts)
  return d ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

function StatusBadge({ status }: { status: SocialPostStatus }) {
  const styles: Record<SocialPostStatus, string> = {
    scheduled: 'bg-blue-900/30 text-blue-400',
    published: 'bg-green-900/30 text-green-400',
    failed: 'bg-red-900/30 text-red-400',
    draft: 'bg-surface-container-high text-on-surface-variant',
    cancelled: 'bg-surface-container text-on-surface-variant/50 line-through',
  }
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium capitalize ${styles[status]}`}>
      {status}
    </span>
  )
}

function PlatformBadge({ platform }: { platform: SocialPlatform }) {
  if (platform === 'x') {
    return <span className="bg-black text-white text-[10px] px-2 py-0.5 rounded font-bold">X</span>
  }
  return <span className="bg-blue-700 text-white text-[10px] px-2 py-0.5 rounded font-bold">LI</span>
}

interface EditPanelProps {
  post: SocialPost
  onClose: () => void
  onSaved: () => void
}

function EditPanel({ post, onClose, onSaved }: EditPanelProps) {
  const [content, setContent] = useState(post.content)
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = tsToDate(post.scheduledFor)
    return d ? d.toISOString().slice(0, 16) : ''
  })
  const [category, setCategory] = useState<SocialPostCategory>(post.category)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(post.tags ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const val = tagInput.trim().replace(/^,|,$/g, '')
      if (val && !tags.includes(val)) setTags((prev) => [...prev, val])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  const handleSave = async () => {
    if (!content.trim()) { setError('Content cannot be empty.'); return }
    setSaving(true)
    try {
      const body: any = { content, category, tags }
      if (scheduledFor) body.scheduledFor = new Date(scheduledFor).toISOString()
      const res = await fetch(`/api/v1/social/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onSaved()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-50 w-96 h-full bg-surface-container border-l border-outline-variant flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h2 className="text-sm font-semibold text-on-surface">Edit Post</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/30 text-red-400 text-xs">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Content</label>
            <textarea
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full rounded-xl bg-surface-container-high px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none outline-none border border-transparent focus:border-outline-variant transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Schedule For</label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full rounded-xl bg-surface-container-high px-3 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SocialPostCategory)}
              className="w-full rounded-xl bg-surface-container-high px-3 py-2.5 text-sm text-on-surface outline-none border border-transparent focus:border-outline-variant transition-colors capitalize"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-2">Tags</label>
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder="Type tag + Enter…"
              className="w-full rounded-xl bg-surface-container-high px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 outline-none border border-transparent focus:border-outline-variant transition-colors"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface text-xs font-medium"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-on-surface-variant hover:text-on-surface transition-colors">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-outline-variant flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-on-surface font-label text-sm font-medium hover:bg-surface-container transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QueuePage() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState<'all' | SocialPlatform>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'scheduled' | 'failed'>('all')
  const [editPost, setEditPost] = useState<SocialPost | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/social/posts?limit=200')
      const body = await res.json()
      setPosts(body.data ?? [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const filtered = posts.filter((p) => {
    // Default: show draft + scheduled
    if (statusFilter === 'all') {
      if (!['draft', 'scheduled', 'failed'].includes(p.status)) return false
    } else {
      if (p.status !== statusFilter) return false
    }
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false
    return true
  })

  const handlePublish = async (post: SocialPost) => {
    setPublishing(post.id)
    // Optimistic update
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: 'published' } : p))
    try {
      await fetch(`/api/v1/social/posts/${post.id}/publish`, { method: 'POST' })
    } catch {
      // revert on error
    } finally {
      setPublishing(null)
      fetchPosts()
    }
  }

  const handleCancel = async (post: SocialPost) => {
    setCancelling(post.id)
    // Optimistic update
    setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, status: 'cancelled' } : p))
    try {
      await fetch(`/api/v1/social/posts/${post.id}`, { method: 'DELETE' })
    } catch {
      // revert on error
    } finally {
      setCancelling(null)
      fetchPosts()
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {editPost && (
        <EditPanel
          post={editPost}
          onClose={() => setEditPost(null)}
          onSaved={() => { setEditPost(null); fetchPosts() }}
        />
      )}

      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Post Queue</h1>
        <p className="text-sm text-on-surface-variant mt-1">Manage drafts, scheduled, and failed posts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1">
          {(['all', 'x', 'linkedin'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 rounded-lg font-label text-xs font-medium transition-colors capitalize ${
                platformFilter === p
                  ? 'bg-white text-black'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {p === 'all' ? 'All Platforms' : p === 'x' ? 'X' : 'LinkedIn'}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['all', 'draft', 'scheduled', 'failed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg font-label text-xs font-medium transition-colors capitalize ${
                statusFilter === s
                  ? 'bg-white text-black'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant text-sm">No posts found.</div>
      ) : (
        <div className="rounded-xl bg-surface-container overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[80px_1fr_90px_120px_80px_120px_160px] gap-3 px-4 py-2.5 border-b border-outline-variant">
            {['Platform', 'Content', 'Category', 'Scheduled For', 'Status', 'Tags', 'Actions'].map((h) => (
              <span key={h} className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{h}</span>
            ))}
          </div>
          {/* Rows */}
          {filtered.map((post, i) => (
            <div
              key={post.id}
              className={`grid grid-cols-[80px_1fr_90px_120px_80px_120px_160px] gap-3 px-4 py-3 items-center ${i > 0 ? 'border-t border-outline-variant' : ''}`}
            >
              <div><PlatformBadge platform={post.platform} /></div>
              <p className="text-sm text-on-surface truncate min-w-0">
                {post.content.slice(0, 60)}{post.content.length > 60 ? '…' : ''}
              </p>
              <span className="text-xs text-on-surface-variant capitalize">{post.category}</span>
              <span className="text-xs text-on-surface-variant">{fmtDateTime(post.scheduledFor)}</span>
              <StatusBadge status={post.status} />
              <div className="flex flex-wrap gap-1 min-w-0">
                {(post.tags ?? []).slice(0, 2).map((t) => (
                  <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">{t}</span>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => handlePublish(post)}
                  disabled={publishing === post.id}
                  className="px-2.5 py-1 rounded-lg bg-white text-black font-label text-[10px] font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
                >
                  Publish
                </button>
                <button
                  onClick={() => setEditPost(post)}
                  className="px-2.5 py-1 rounded-lg bg-surface-container-high text-on-surface font-label text-[10px] font-medium hover:bg-surface-container transition-colors"
                >
                  Edit
                </button>
                {['draft', 'scheduled'].includes(post.status) && (
                  <button
                    onClick={() => handleCancel(post)}
                    disabled={cancelling === post.id}
                    className="px-2.5 py-1 rounded-lg bg-red-900/30 text-red-400 font-label text-[10px] font-medium hover:bg-red-900/50 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
