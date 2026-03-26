'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'

type SocialPlatform = 'x' | 'linkedin'
type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

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
  if (ts._seconds) return new Date(ts._seconds * 1000)   // Firestore REST serialization
  if (ts.seconds) return new Date(ts.seconds * 1000)     // Firestore SDK serialization
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

function ExternalIdLink({ platform, externalId }: { platform: SocialPlatform; externalId: string | null }) {
  if (!externalId) return <span className="text-xs text-on-surface-variant/40">—</span>
  if (platform === 'x') {
    return (
      <a
        href={`https://x.com/i/web/status/${externalId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-400 hover:underline truncate block max-w-[120px]"
      >
        {externalId}
      </a>
    )
  }
  return <span className="text-xs text-on-surface-variant font-mono truncate block max-w-[120px]">{externalId}</span>
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [platformFilter, setPlatformFilter] = useState<'all' | SocialPlatform>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'failed' | 'cancelled'>('all')

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

  const HISTORY_STATUSES: SocialPostStatus[] = ['published', 'failed', 'cancelled']

  const filtered = posts.filter((p) => {
    if (!HISTORY_STATUSES.includes(p.status)) return false
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (platformFilter !== 'all' && p.platform !== platformFilter) return false
    return true
  })

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">History</h1>
        <p className="text-sm text-on-surface-variant mt-1">Published, failed, and cancelled posts</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex gap-1">
          {(['all', 'x', 'linkedin'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(p)}
              className={`px-3 py-1.5 rounded-lg font-label text-xs font-medium transition-colors ${
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
          {(['all', 'published', 'failed', 'cancelled'] as const).map((s) => (
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
          <div className="grid grid-cols-[80px_1fr_90px_120px_80px_140px_120px] gap-3 px-4 py-2.5 border-b border-outline-variant">
            {['Platform', 'Content', 'Category', 'Published At', 'Status', 'External ID', 'Error'].map((h) => (
              <span key={h} className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{h}</span>
            ))}
          </div>
          {/* Rows */}
          {filtered.map((post, i) => (
            <div
              key={post.id}
              className={`grid grid-cols-[80px_1fr_90px_120px_80px_140px_120px] gap-3 px-4 py-3 items-start ${i > 0 ? 'border-t border-outline-variant' : ''}`}
            >
              <div className="pt-0.5"><PlatformBadge platform={post.platform} /></div>
              <div className="min-w-0">
                <p className="text-sm text-on-surface truncate">
                  {post.content.slice(0, 60)}{post.content.length > 60 ? '…' : ''}
                </p>
                {post.status === 'failed' && post.error && (
                  <p className="text-xs text-red-400 mt-0.5 truncate">{post.error}</p>
                )}
              </div>
              <span className="text-xs text-on-surface-variant capitalize pt-0.5">{post.category}</span>
              <span className="text-xs text-on-surface-variant pt-0.5">{fmtDateTime(post.publishedAt)}</span>
              <div className="pt-0.5"><StatusBadge status={post.status} /></div>
              <div className="pt-0.5">
                <ExternalIdLink platform={post.platform} externalId={post.externalId} />
              </div>
              <div className="pt-0.5 min-w-0">
                {post.error ? (
                  <span className="text-[10px] text-red-400 leading-tight block truncate">{post.error}</span>
                ) : (
                  <span className="text-xs text-on-surface-variant/40">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
