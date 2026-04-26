'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type PostStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'published' | 'failed' | 'cancelled'
type FilterTab = 'pending' | 'scheduled' | 'published'

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

const PLATFORM_COLORS: Record<string, { bg: string; label: string }> = {
  twitter: { bg: 'bg-black', label: 'X' },
  x: { bg: 'bg-black', label: 'X' },
  linkedin: { bg: 'bg-blue-700', label: 'LI' },
  facebook: { bg: 'bg-blue-600', label: 'FB' },
  instagram: { bg: 'bg-pink-600', label: 'IG' },
  reddit: { bg: 'bg-orange-600', label: 'RD' },
  tiktok: { bg: 'bg-gray-800', label: 'TT' },
  pinterest: { bg: 'bg-red-700', label: 'PI' },
  bluesky: { bg: 'bg-sky-500', label: 'BS' },
  threads: { bg: 'bg-gray-700', label: 'TH' },
}

const STATUS_COLORS: Record<string, string> = {
  active: 'border-green-400/40 text-green-300',
  token_expired: 'border-red-400/40 text-red-300',
  disconnected: 'border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]',
  rate_limited: 'border-yellow-400/40 text-yellow-300',
}

const POST_STATUS_COLORS: Record<PostStatus, string> = {
  draft: 'border-white/10 text-white/40',
  pending_approval: 'border-amber-400/40 text-amber-300',
  approved: 'border-blue-400/40 text-blue-300',
  scheduled: 'border-blue-400/40 text-blue-300',
  published: 'border-green-400/40 text-green-300',
  failed: 'border-red-400/40 text-red-300',
  cancelled: 'border-white/10 text-white/40',
}

function PlatformBadge({ platform }: { platform: string }) {
  const config = PLATFORM_COLORS[platform] ?? { bg: 'bg-gray-600', label: platform.slice(0, 2).toUpperCase() }
  return <span className={`${config.bg} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>{config.label}</span>
}

function getPostText(post: any): string {
  if (typeof post.content === 'string') return post.content
  if (post.content?.text) return post.content.text
  return ''
}

function getPostPlatforms(post: any): string[] {
  if (post.platforms?.length) return post.platforms
  if (post.platform) return [post.platform]
  return []
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null
  if (ts._seconds) return new Date(ts._seconds * 1000)
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function fmtDate(ts: any) {
  const d = tsToDate(ts)
  return d ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
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
  const text = getPostText(post)
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

  return (
    <div className="border border-white/10 p-4 space-y-3">
      {/* Header: Platform badges and status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-1 flex-wrap">
          {getPostPlatforms(post).map(p => (
            <PlatformBadge key={p} platform={p} />
          ))}
        </div>
        <span className={`text-xs font-label uppercase tracking-widest border px-2 py-0.5 flex-shrink-0 ${POST_STATUS_COLORS[post.status]}`}>
          {post.status === 'pending_approval' ? 'Needs Approval' : post.status}
        </span>
      </div>

      {/* Content preview */}
      <p className="text-sm text-white/80 line-clamp-3">{text.slice(0, 200)}</p>

      {/* Scheduled time */}
      {post.scheduledAt && (
        <p className="text-xs text-white/30">
          Scheduled: {fmtDate(post.scheduledAt)}
        </p>
      )}

      {/* Approval buttons */}
      {isPending && (
        <div className="flex gap-2 pt-2 border-t border-white/10">
          <button
            onClick={onApprove}
            disabled={loading}
            className="flex-1 px-3 py-2 text-xs font-label font-bold uppercase tracking-widest rounded transition-colors"
            style={{
              background: 'var(--color-accent-v2)',
              color: '#000',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Saving…' : '✓ Approve'}
          </button>
          <button
            onClick={onReject}
            disabled={loading}
            className="flex-1 px-3 py-2 text-xs font-label font-bold uppercase tracking-widest border rounded transition-colors"
            style={{
              borderColor: '#ef4444',
              color: '#ef4444',
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            ✕ Reject
          </button>
        </div>
      )}

      {/* Comments toggle */}
      <button
        onClick={onToggleExpand}
        className="text-xs text-[var(--color-on-surface-variant)] hover:text-[var(--color-accent-v2)] cursor-pointer mt-2"
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
                  <span className="font-medium text-[var(--color-on-surface)]">{comment.userName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    background: comment.userRole === 'admin' ? 'rgba(245, 183, 0, 0.15)' : comment.userRole === 'ai' ? 'rgba(245, 183, 0, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                    color: comment.userRole === 'admin' ? 'var(--color-accent-v2)' : comment.userRole === 'ai' ? 'var(--color-accent-v2)' : 'var(--color-on-surface-variant)',
                  }}>
                    {comment.userRole}
                  </span>
                  <span className="text-[var(--color-on-surface-variant)] ml-auto flex-shrink-0">{formatCommentTime(comment.createdAt)}</span>
                </div>
                <p className="text-[var(--color-on-surface)] mt-1">{comment.text}</p>
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
              className="flex-1 bg-transparent border border-[var(--color-outline-variant)] rounded-[var(--radius-btn)] px-2 py-1.5 text-xs text-[var(--color-on-surface)] placeholder-[var(--color-on-surface-variant)] focus:outline-none focus:border-[var(--color-accent-v2)] focus:bg-[rgba(245,183,0,0.05)]"
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

export default function PortalSocialDashboard() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [tab, setTab] = useState<FilterTab>('pending')
  const [commentsByPostId, setCommentsByPostId] = useState<Record<string, Comment[]>>({})
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [commentTextByPostId, setCommentTextByPostId] = useState<Record<string, string>>({})
  const [commentLoading, setCommentLoading] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/social/accounts').then(r => r.json()),
      fetch('/api/v1/social/posts?limit=100').then(r => r.json()),
      fetch('/api/v1/organizations').then(r => r.json()),
    ]).then(([accBody, postBody, orgBody]) => {
      setAccounts(accBody.data ?? [])
      setPosts(postBody.data ?? [])
      if (orgBody.data?.[0]?.name) setOrgName(orgBody.data[0].name)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleAction(postId: string, action: 'approve' | 'reject') {
    setActionLoading(postId)
    setActionError(null)
    try {
      const res = await fetch(`/api/v1/social/posts/${postId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const body = await res.json()
      if (body.data?.status) {
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: body.data.status as PostStatus } : p))
      } else if (!res.ok) {
        setActionError(body.error || 'Action failed')
      }
    } catch (err) {
      setActionError('Network error')
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

  const activeAccounts = accounts.filter(a => a.status === 'active')
  const pendingPosts = posts.filter(p => p.status === 'pending_approval')
  const scheduledPosts = posts.filter(p => p.status === 'scheduled')
  const publishedPosts = posts.filter(p => p.status === 'published')

  const displayPosts = tab === 'pending' ? pendingPosts : tab === 'scheduled' ? scheduledPosts : publishedPosts

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Social Media</h1>
        {orgName && <p className="text-xs text-[var(--color-on-surface-variant)] mt-0.5">{orgName}</p>}
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">Manage your social media presence</p>
      </div>

      {/* Summary stats - Quick row at top */}
      {!loading && (
        <div className="flex items-center gap-6 p-4 bg-[var(--color-surface-variant)] rounded-[var(--radius-md)]">
          <div className="text-center">
            <p className="text-sm font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">Pending Approval</p>
            <p className="text-2xl font-headline font-bold mt-1" style={{ color: pendingPosts.length > 0 ? 'var(--color-accent-v2, #f5b700)' : 'inherit' }}>
              {pendingPosts.length}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">Scheduled</p>
            <p className="text-2xl font-headline font-bold mt-1 text-blue-300">{scheduledPosts.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">Published</p>
            <p className="text-2xl font-headline font-bold mt-1 text-green-300">{publishedPosts.length}</p>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/portal/social/compose"
          className="pib-btn-primary"
        >
          Compose Post
        </Link>
        <Link
          href="/portal/social/vault"
          className="pib-btn-secondary"
        >
          Vault
        </Link>
        <Link
          href="/portal/social/history"
          className="pib-btn-secondary"
        >
          Post History
        </Link>
        <Link
          href="/portal/social/accounts"
          className="pib-btn-secondary"
        >
          Manage Accounts
        </Link>
      </div>

      {/* Connected Accounts */}
      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-3">Connected Accounts</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="pib-skeleton p-5 h-16" />
            ))}
          </div>
        ) : activeAccounts.length === 0 ? (
          <div className="pib-card text-center">
            <p className="text-[var(--color-on-surface-variant)] mb-4">No accounts connected yet.</p>
            <Link href="/portal/social/accounts" className="text-[var(--color-accent-v2)] underline text-sm">Connect an account →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAccounts.map((acc: any) => (
              <div key={acc.id} className="pib-card p-4 flex items-center gap-3">
                <PlatformBadge platform={acc.platform} />
                <div className="flex-1 min-w-0">
                  <p className="font-headline font-bold tracking-tight truncate">{acc.displayName}</p>
                  <p className="text-[var(--color-on-surface-variant)] text-xs">@{acc.username || acc.displayName}</p>
                </div>
                <span className={`text-xs font-label uppercase tracking-widest border px-2 py-0.5 ${STATUS_COLORS[acc.status] ?? 'border-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'}`}>
                  {acc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Posts with tabs */}
      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] mb-4">Posts</h2>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--color-outline-variant)] mb-4">
          {([
            { key: 'pending' as FilterTab, label: `Needs Approval (${pendingPosts.length})` },
            { key: 'scheduled' as FilterTab, label: `Scheduled (${scheduledPosts.length})` },
            { key: 'published' as FilterTab, label: `Published (${publishedPosts.length})` },
          ]).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 text-sm font-label border-b-2 -mb-px transition-colors"
              style={{
                borderColor: tab === t.key ? 'var(--color-accent-v2, #f5b700)' : 'transparent',
                color: tab === t.key ? 'white' : 'rgba(255, 255, 255, 0.6)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error message */}
        {actionError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-400/40 text-red-300 text-sm rounded">
            {actionError}
          </div>
        )}

        {/* Posts list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="pib-skeleton p-5 h-24" />
            ))}
          </div>
        ) : displayPosts.length === 0 ? (
          <div className="pib-card text-center">
            <p className="text-[var(--color-on-surface-variant)]">
              {tab === 'pending' ? 'All caught up! No posts waiting for your approval. ✓' :
               tab === 'scheduled' ? 'No posts scheduled yet.' :
               'No published posts yet.'}
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
      </div>
    </div>
  )
}
