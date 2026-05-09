'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published' | 'failed' | 'cancelled'
type FilterTab = 'pending' | 'all' | 'published' | 'analytics'

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

interface SocialPost {
  id: string
  content: { text: string; platformOverrides?: Record<string, any> } | string
  platforms: string[]
  status: PostStatus
  scheduledAt?: any
  createdAt?: any
  approvedBy?: string | null
}

interface Comment {
  id: string
  text: string
  userId: string
  userName: string
  userRole: 'admin' | 'client' | 'ai'
  createdAt: any
  agentPickedUp: boolean
  agentPickedUpAt?: any
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`pib-skeleton ${className}`} />
}

const STATUS_MAP: Record<PostStatus, { label: string; color: string }> = {
  draft:            { label: 'Draft',            color: 'var(--color-outline)' },
  pending_approval: { label: 'Needs Approval',   color: 'var(--color-accent-v2)' },
  approved:         { label: 'Approved',         color: '#60a5fa' },
  scheduled:        { label: 'Scheduled',        color: '#c084fc' },
  published:        { label: 'Published',        color: '#4ade80' },
  failed:           { label: 'Failed',           color: '#ef4444' },
  cancelled:        { label: 'Cancelled',        color: 'var(--color-outline)' },
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  x: '#000000',
  linkedin: '#0A66C2',
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#010101',
  bluesky: '#0085FF',
  threads: '#000000',
  reddit: '#FF4500',
  pinterest: '#E60023',
}

function PostCard({
  post,
  onApprove,
  onReject,
  loading,
  comments,
  isExpanded,
  onToggleExpand,
  onAddComment,
  commentText,
  onCommentTextChange,
  commentLoading,
}: {
  post: SocialPost
  onApprove: () => void
  onReject: () => void
  loading: boolean
  comments: Comment[]
  isExpanded: boolean
  onToggleExpand: () => void
  onAddComment: () => void
  commentText: string
  onCommentTextChange: (text: string) => void
  commentLoading: boolean
}) {
  const text = typeof post.content === 'string' ? post.content : post.content?.text ?? ''
  const status = STATUS_MAP[post.status] ?? { label: post.status, color: 'var(--color-outline)' }
  const isPending = post.status === 'pending_approval'

  function getRoleColor(role: string): string {
    if (role === 'admin') return 'bg-amber-500'
    if (role === 'ai') return 'bg-amber-500'
    return 'bg-gray-600'
  }

  function formatCommentTime(ts: any): string {
    const d = tsToDate(ts)
    if (!d) return '—'
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })
  }

  function tsToDate(ts: any): Date | null {
    if (!ts) return null
    if (ts._seconds) return new Date(ts._seconds * 1000)
    if (ts.seconds) return new Date(ts.seconds * 1000)
    return new Date(ts)
  }

  return (
    <div
      className="pib-card space-y-3"
      style={isPending ? { borderColor: 'var(--color-accent-subtle)' } : {}}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {(post.platforms ?? []).map(p => (
            <span
              key={p}
              className="text-[9px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: `${PLATFORM_COLORS[p] ?? '#666'}20`, color: PLATFORM_COLORS[p] ?? 'var(--color-on-surface-variant)' }}
            >
              {p}
            </span>
          ))}
        </div>
        <span
          className="text-[9px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${status.color}20`, color: status.color }}
        >
          {status.label}
        </span>
      </div>

      {/* Content */}
      <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap line-clamp-4">{text}</p>

      {/* Scheduled time */}
      {post.scheduledAt && (
        <p className="text-xs text-on-surface-variant">
          Scheduled: {new Date(post.scheduledAt._seconds * 1000).toLocaleString()}
        </p>
      )}

      {/* Approval actions */}
      {isPending && (
        <div className="flex gap-2 pt-1 border-t border-[var(--color-card-border)]">
          <button
            onClick={onApprove}
            disabled={loading}
            className="pib-btn-primary text-xs font-label flex-1"
          >
            {loading ? 'Saving…' : '✓ Approve'}
          </button>
          <button
            onClick={onReject}
            disabled={loading}
            className="text-xs font-label px-4 py-2 rounded-[var(--radius-btn)] border transition-colors flex-1"
            style={{ borderColor: '#ef4444', color: '#ef4444' }}
          >
            ✕ Reject
          </button>
        </div>
      )}

      {/* Comments toggle */}
      <button
        onClick={onToggleExpand}
        className="text-xs text-on-surface-variant hover:text-[var(--color-accent-v2)] cursor-pointer mt-2"
      >
        Comments ({comments.length})
      </button>

      {/* Comment thread */}
      {isExpanded && (
        <div className="mt-3 border-t border-[var(--color-outline-variant)] pt-3 space-y-2">
          {/* Existing comments */}
          {comments.map(comment => (
            <div key={comment.id} className="flex gap-2 text-xs">
              <div className={`${getRoleColor(comment.userRole)} rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 text-white text-[10px] font-bold`}>
                {comment.userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-medium text-on-surface">{comment.userName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    background: comment.userRole === 'admin' ? 'rgba(245, 183, 0, 0.15)' : comment.userRole === 'ai' ? 'rgba(245, 183, 0, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    color: comment.userRole === 'admin' ? 'var(--color-accent-v2)' : comment.userRole === 'ai' ? 'var(--color-accent-v2)' : 'var(--color-on-surface-variant)',
                  }}>
                    {comment.userRole}
                  </span>
                  <span className="text-on-surface-variant ml-auto flex-shrink-0">{formatCommentTime(comment.createdAt)}</span>
                </div>
                <p className="text-on-surface mt-1">{comment.text}</p>
              </div>
            </div>
          ))}

          {/* Comment input */}
          <div className="flex gap-2 mt-2 pt-2 border-t border-[var(--color-outline-variant)]">
            <input
              type="text"
              value={commentText}
              onChange={(e) => onCommentTextChange(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 bg-transparent border border-[var(--color-outline-variant)] rounded-[var(--radius-btn)] px-2 py-1.5 text-xs text-on-surface placeholder-on-surface-variant focus:outline-none focus:border-[var(--color-accent-v2)] focus:bg-[rgba(245,183,0,0.05)]"
              disabled={commentLoading}
            />
            <button
              onClick={onAddComment}
              disabled={commentLoading || !commentText.trim()}
              className="pib-btn-primary text-xs px-3 py-1.5"
              style={{
                opacity: (commentLoading || !commentText.trim()) ? 0.6 : 1,
                cursor: (commentLoading || !commentText.trim()) ? 'not-allowed' : 'pointer',
              }}
            >
              {commentLoading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function OrgSocialPage() {
  const params = useParams()
  const slug = params.slug as string

  const [posts, setPosts] = useState<SocialPost[]>([])
  const [stats, setStats] = useState<SocialStats | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<FilterTab>('pending')
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, Comment[]>>({})
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [commentTextByPostId, setCommentTextByPostId] = useState<Record<string, string>>({})
  const [commentLoading, setCommentLoading] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v1/organizations`)
      .then(r => r.json())
      .then(body => {
        const org = (body.data ?? []).find((o: any) => o.slug === slug)
        const fetchedOrgId = org?.id ?? null
        if (fetchedOrgId) setOrgId(fetchedOrgId)
        return fetchedOrgId
      })
      .then(fetchedOrgId => {
        if (!fetchedOrgId) return
        const orgQs = `orgId=${encodeURIComponent(fetchedOrgId)}`
        return Promise.all([
          fetch(`/api/v1/social/posts?limit=50&${orgQs}`)
            .then(r => r.json())
            .then(body => setPosts(body.data ?? [])),
          fetch(`/api/v1/social/stats?${orgQs}`)
            .then(r => r.json())
            .then(body => setStats(body.data ?? null))
            .catch(() => {}),
        ])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [slug])

  async function handleAction(postId: string, action: 'approve' | 'reject') {
    setActionLoading(postId)
    try {
      const res = await fetch(`/api/v1/social/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json()
      if (body.data?.status) {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: body.data.status as PostStatus } : p))
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function handleToggleCommentThread(postId: string) {
    if (expandedPostId === postId) {
      // Collapsing
      setExpandedPostId(null)
    } else {
      // Expanding
      setExpandedPostId(postId)
      // Fetch comments if not already loaded
      if (!(postId in commentsByPostId)) {
        try {
          const res = await fetch(`/api/v1/social/posts/${postId}/comments`)
          const body = await res.json()
          if (body.data) {
            setCommentsByPostId(prev => ({ ...prev, [postId]: body.data }))
          }
        } catch (err) {
          console.error('Failed to fetch comments:', err)
        }
      }
    }
  }

  async function handleAddComment(postId: string) {
    const text = commentTextByPostId[postId]?.trim()
    if (!text) return

    setCommentLoading(postId)
    try {
      const res = await fetch(`/api/v1/social/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json()
      if (body.data) {
        setCommentsByPostId(prev => ({
          ...prev,
          [postId]: [...(prev[postId] ?? []), body.data],
        }))
        setCommentTextByPostId(prev => ({ ...prev, [postId]: '' }))
      }
    } catch (err) {
      console.error('Failed to add comment:', err)
    } finally {
      setCommentLoading(null)
    }
  }

  const pendingPosts = posts.filter(p => p.status === 'pending_approval')
  const publishedPosts = posts.filter(p => p.status === 'published')

  const displayPosts = tab === 'pending'
    ? pendingPosts
    : tab === 'published'
    ? publishedPosts
    : posts

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Workspace / Social</p>
          <h1 className="text-2xl font-headline font-bold text-on-surface">Social Media</h1>
        </div>
        <Link href="/admin/social/compose" className="pib-btn-primary text-sm font-label">
          + Compose Post
        </Link>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="pib-card">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Needs Approval</p>
            <p className="text-2xl font-headline font-bold" style={{ color: pendingPosts.length > 0 ? 'var(--color-accent-v2)' : 'var(--color-on-surface)' }}>
              {pendingPosts.length}
            </p>
          </div>
          <div className="pib-card">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Total Posts</p>
            <p className="text-2xl font-headline font-bold text-on-surface">{posts.length}</p>
          </div>
          <div className="pib-card">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-1">Published</p>
            <p className="text-2xl font-headline font-bold text-on-surface">{publishedPosts.length}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-card-border)] overflow-x-auto">
        {([
          { key: 'pending', label: `Needs Approval (${pendingPosts.length})` },
          { key: 'all',     label: `All Posts (${posts.length})` },
          { key: 'published', label: `Published (${publishedPosts.length})` },
          { key: 'analytics', label: 'Analytics' },
        ] as { key: FilterTab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              'px-4 py-2 text-sm font-label border-b-2 -mb-px transition-colors whitespace-nowrap',
              tab === t.key
                ? 'border-[var(--color-accent-v2)] text-on-surface'
                : 'border-transparent text-on-surface-variant hover:text-on-surface',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Analytics Tab */}
      {tab === 'analytics' && !loading && stats && (
        <div className="space-y-6">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Total Posts</p>
              <p className="text-3xl font-headline font-bold text-on-surface">{stats.total}</p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Published</p>
              <p className="text-3xl font-headline font-bold text-on-surface">{stats.byStatus.published}</p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Approval Rate</p>
              <p className="text-3xl font-headline font-bold" style={{ color: 'var(--color-accent-v2)' }}>{stats.approvalRate}%</p>
            </div>
            <div className="pib-card">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-2">Last 30 Days</p>
              <p className="text-3xl font-headline font-bold text-on-surface">{stats.last30Days}</p>
            </div>
          </div>

          {/* Platform Breakdown */}
          {Object.keys(stats.byPlatform).length > 0 && (
            <div className="pib-card space-y-4">
              <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Platform Breakdown</p>
              <div className="space-y-3">
                {Object.entries(stats.byPlatform).map(([platform, count]) => {
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0
                  return (
                    <div key={platform} className="flex items-center gap-3">
                      <span className="text-xs w-20 text-on-surface-variant capitalize font-medium">{platform}</span>
                      <div className="flex-1 h-2 rounded-full bg-outline-variant overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${percentage}%`, background: 'var(--color-accent-v2)' }}
                        />
                      </div>
                      <span className="text-xs text-on-surface font-medium w-12 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Status Breakdown */}
          <div className="pib-card space-y-4">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Status Breakdown</p>
            <div className="space-y-2">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                count > 0 && (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-on-surface capitalize">{status.replace(/_/g, ' ')}</span>
                    <span className="text-sm font-headline font-bold text-on-surface">{count}</span>
                  </div>
                )
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="pib-card">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant mb-3">Actions</p>
            <div className="flex flex-wrap gap-2">
              {(['pending_approval', 'draft', 'scheduled', 'published'] as const).map(status => {
                const count = stats.byStatus[status]
                if (count === 0) return null
                return (
                  <button
                    key={status}
                    onClick={() => {
                      if (status === 'pending_approval') setTab('pending')
                      else if (status === 'published') setTab('published')
                      else setTab('all')
                    }}
                    className="pib-btn-secondary text-xs font-label"
                  >
                    View {status.replace(/_/g, ' ')} ({count})
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Posts */}
      {tab !== 'analytics' && (
        <>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : displayPosts.length === 0 ? (
            <div className="pib-card py-12 text-center">
              <p className="text-on-surface-variant text-sm">
                {tab === 'pending' ? 'No posts waiting for approval. 🎉' : 'No posts found.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayPosts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onApprove={() => handleAction(post.id, 'approve')}
                  onReject={() => handleAction(post.id, 'reject')}
                  loading={actionLoading === post.id}
                  comments={commentsByPostId[post.id] ?? []}
                  isExpanded={expandedPostId === post.id}
                  onToggleExpand={() => handleToggleCommentThread(post.id)}
                  onAddComment={() => handleAddComment(post.id)}
                  commentText={commentTextByPostId[post.id] ?? ''}
                  onCommentTextChange={(text) => setCommentTextByPostId(prev => ({ ...prev, [post.id]: text }))}
                  commentLoading={commentLoading === post.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
