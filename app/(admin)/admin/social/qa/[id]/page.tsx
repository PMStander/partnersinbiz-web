'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { useOrg } from '@/lib/contexts/OrgContext'
import { useToast } from '@/components/ui/Toast'

type SocialPlatform =
  | 'twitter'
  | 'x'
  | 'linkedin'
  | 'facebook'
  | 'instagram'
  | 'reddit'
  | 'tiktok'
  | 'pinterest'
  | 'bluesky'
  | 'threads'
  | 'youtube'
  | 'mastodon'
  | 'dribbble'

type SocialPostStatus =
  | 'draft'
  | 'qa_review'
  | 'client_review'
  | 'regenerating'
  | 'approved'
  | 'vaulted'
  | 'scheduled'
  | 'publishing'
  | 'published'

interface MediaItem {
  id?: string
  url?: string
  type?: string
  caption?: string
}

interface SocialPost {
  id: string
  platform?: SocialPlatform
  platforms?: SocialPlatform[]
  content: string | { text: string; platformOverrides?: Record<string, string> }
  originalContent?: string | { text: string }
  hashtags?: string[]
  media?: MediaItem[]
  status: SocialPostStatus
  scheduledFor?: any
  createdBy?: string
  createdByName?: string
  createdAt?: any
  aiPrompt?: string
  prompt?: string
  approval?: {
    regenerationCount?: number
    rejectionReason?: string
  }
}

type CommentKind =
  | 'note'
  | 'qa_rejection'
  | 'client_rejection'
  | 'agent_handoff'

interface CommentItem {
  id: string
  text: string
  userId?: string
  userName?: string
  userRole?: 'admin' | 'client' | 'ai' | string
  kind?: CommentKind
  createdAt?: any
  agentPickedUp?: boolean
}

const PLATFORM_COLORS: Record<string, { bg: string; label: string; full: string }> = {
  twitter: { bg: 'bg-black', label: 'X', full: 'X (Twitter)' },
  x: { bg: 'bg-black', label: 'X', full: 'X (Twitter)' },
  linkedin: { bg: 'bg-blue-700', label: 'LI', full: 'LinkedIn' },
  facebook: { bg: 'bg-blue-600', label: 'FB', full: 'Facebook' },
  instagram: { bg: 'bg-pink-600', label: 'IG', full: 'Instagram' },
  reddit: { bg: 'bg-orange-600', label: 'RD', full: 'Reddit' },
  tiktok: { bg: 'bg-gray-800', label: 'TT', full: 'TikTok' },
  pinterest: { bg: 'bg-red-700', label: 'PI', full: 'Pinterest' },
  bluesky: { bg: 'bg-sky-500', label: 'BS', full: 'Bluesky' },
  threads: { bg: 'bg-gray-700', label: 'TH', full: 'Threads' },
  youtube: { bg: 'bg-red-600', label: 'YT', full: 'YouTube' },
  mastodon: { bg: 'bg-purple-600', label: 'MA', full: 'Mastodon' },
  dribbble: { bg: 'bg-pink-500', label: 'DR', full: 'Dribbble' },
}

const STATUS_PILL_STYLES: Partial<Record<SocialPostStatus, string>> = {
  qa_review: 'bg-amber-500/10 text-amber-400',
  regenerating: 'bg-indigo-500/10 text-indigo-400',
  approved: 'bg-green-500/10 text-green-400',
  client_review: 'bg-violet-500/10 text-violet-400',
  draft: 'bg-surface-container-high text-on-surface-variant',
  scheduled: 'bg-blue-500/10 text-blue-400',
  publishing: 'bg-blue-500/10 text-blue-400',
  published: 'bg-green-500/10 text-green-400',
  vaulted: 'bg-surface-container-high text-on-surface-variant',
}

const COMMENT_KIND_META: Record<
  CommentKind,
  { label: string; icon: string; tone: string }
> = {
  note: { label: 'Note', icon: '✎', tone: 'bg-surface-container-high text-on-surface-variant' },
  qa_rejection: { label: 'QA rejection', icon: '✕', tone: 'bg-red-500/10 text-red-400' },
  client_rejection: {
    label: 'Client rejection',
    icon: '✕',
    tone: 'bg-rose-500/10 text-rose-400',
  },
  agent_handoff: {
    label: 'Agent handoff',
    icon: '⤳',
    tone: 'bg-indigo-500/10 text-indigo-400',
  },
}

const ROLE_PILL_STYLES: Record<string, string> = {
  admin: 'bg-amber-500/10 text-amber-400',
  client: 'bg-violet-500/10 text-violet-400',
  ai: 'bg-sky-500/10 text-sky-400',
}

function getPostText(post: SocialPost): string {
  if (typeof post.content === 'string') return post.content
  if (post.content?.text) return post.content.text
  return ''
}

function getOriginalText(post: SocialPost): string {
  if (!post.originalContent) return ''
  if (typeof post.originalContent === 'string') return post.originalContent
  if (post.originalContent.text) return post.originalContent.text
  return ''
}

function getPostPlatforms(post: SocialPost): string[] {
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

function fmtDateTime(ts: any) {
  const d = tsToDate(ts)
  return d
    ? d.toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
}

function timeAgo(ts: any): string {
  const date = tsToDate(ts)
  if (!date) return '—'
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
}

function PlatformChip({ platform }: { platform: string }) {
  const config = PLATFORM_COLORS[platform] ?? {
    bg: 'bg-surface-container-high',
    label: platform.slice(0, 2).toUpperCase(),
    full: platform,
  }
  return (
    <span className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-surface-container-high text-xs">
      <span className={`${config.bg} text-white text-[9px] px-1.5 py-0.5 rounded font-bold`}>
        {config.label}
      </span>
      <span className="text-on-surface">{config.full}</span>
    </span>
  )
}

function StatusPill({ status }: { status: SocialPostStatus }) {
  const tone =
    STATUS_PILL_STYLES[status] ?? 'bg-surface-container-high text-on-surface-variant'
  return (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function RolePill({ role }: { role?: string }) {
  if (!role) return null
  const normalized = role.toLowerCase()
  const tone =
    ROLE_PILL_STYLES[normalized] ?? 'bg-surface-container-high text-on-surface-variant'
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${tone}`}>
      {role}
    </span>
  )
}

function RejectModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (reason: string) => void | Promise<void>
  submitting: boolean
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) {
      setReason('')
      setError('')
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async () => {
    const trimmed = reason.trim()
    if (trimmed.length < 10) {
      setError('Please provide at least 10 characters of feedback.')
      return
    }
    setError('')
    await onSubmit(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative pib-card w-full max-w-md space-y-4">
        <div>
          <p className="eyebrow">qa</p>
          <h2 className="font-headline text-xl text-on-surface mt-1">
            Reject + regenerate
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Tell the agent what to fix. Min 10 characters.
          </p>
        </div>

        <div>
          <label className="pib-label" htmlFor="reject-reason">
            Rejection reason
          </label>
          <textarea
            id="reject-reason"
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Tone is too formal — make it more conversational and shorter."
            className="pib-textarea"
            autoFocus
          />
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="pib-btn-secondary text-sm" disabled={submitting}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="pib-btn-primary text-sm disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send back for regeneration'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function QaDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id
  const { orgId } = useOrg()
  const toast = useToast()

  const [post, setPost] = useState<SocialPost | null>(null)
  const [postLoading, setPostLoading] = useState(true)
  const [postError, setPostError] = useState('')

  const [comments, setComments] = useState<CommentItem[]>([])
  const [commentsLoading, setCommentsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [postingComment, setPostingComment] = useState(false)

  const [showOriginal, setShowOriginal] = useState(false)
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const orgQs = orgId ? `?orgId=${orgId}` : ''

  const fetchPost = useCallback(async () => {
    if (!id) return
    setPostLoading(true)
    setPostError('')
    try {
      const res = await fetch(`/api/v1/social/posts/${id}${orgQs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to load post')
      setPost(body.data ?? body)
    } catch (err: any) {
      setPostError(err?.message ?? 'Failed to load post')
    } finally {
      setPostLoading(false)
    }
  }, [id, orgQs])

  const fetchComments = useCallback(async () => {
    if (!id) return
    setCommentsLoading(true)
    try {
      const res = await fetch(`/api/v1/social/posts/${id}/comments${orgQs}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Failed to load comments')
      const data: CommentItem[] = body.data ?? body ?? []
      // Chronological — oldest first
      data.sort((a, b) => {
        const ad = tsToDate(a.createdAt)?.getTime() ?? 0
        const bd = tsToDate(b.createdAt)?.getTime() ?? 0
        return ad - bd
      })
      setComments(data)
    } catch {
      setComments([])
    } finally {
      setCommentsLoading(false)
    }
  }, [id, orgQs])

  useEffect(() => {
    fetchPost()
    fetchComments()
  }, [fetchPost, fetchComments])

  const handleApprove = async () => {
    if (!id) return
    setApproving(true)
    try {
      const res = await fetch(`/api/v1/social/posts/${id}/qa-approve${orgQs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to approve')
      toast.success('Approved — sent to client review')
      router.push('/admin/social/qa')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to approve')
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async (reason: string) => {
    if (!id) return
    setRejecting(true)
    try {
      const res = await fetch(`/api/v1/social/posts/${id}/qa-reject${orgQs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to reject')
      toast.success('Sent back for regeneration')
      setRejectOpen(false)
      router.push('/admin/social/qa')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to reject')
    } finally {
      setRejecting(false)
    }
  }

  const handleManualRegenerate = async () => {
    if (!id) return
    if (
      !window.confirm(
        'Trigger a manual regenerate for this post? Use this only if the regenerating call appears stuck.',
      )
    ) {
      return
    }
    setRegenerating(true)
    try {
      const res = await fetch(`/api/v1/social/posts/${id}/regenerate${orgQs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to regenerate')
      toast.success('Regeneration triggered')
      fetchPost()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to regenerate')
    } finally {
      setRegenerating(false)
    }
  }

  const handlePostComment = async () => {
    const text = newComment.trim()
    if (!text || !id) return
    setPostingComment(true)
    try {
      const res = await fetch(`/api/v1/social/posts/${id}/comments${orgQs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? 'Failed to post note')
      setNewComment('')
      fetchComments()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to post note')
    } finally {
      setPostingComment(false)
    }
  }

  const platforms = useMemo(() => (post ? getPostPlatforms(post) : []), [post])
  const text = useMemo(() => (post ? getPostText(post) : ''), [post])
  const original = useMemo(() => (post ? getOriginalText(post) : ''), [post])
  const aiPrompt = post?.aiPrompt || post?.prompt || ''
  const media = post?.media ?? []

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onSubmit={handleReject}
        submitting={rejecting}
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/social/qa"
            className="text-xs text-on-surface-variant hover:text-on-surface inline-flex items-center gap-1"
          >
            ← Back to QA queue
          </Link>
          <p className="eyebrow mt-2">social</p>
          <h1 className="font-headline text-3xl text-on-surface mt-1">
            QA Review
          </h1>
        </div>
        {post && (
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill status={post.status} />
            {typeof post.approval?.regenerationCount === 'number' &&
              post.approval.regenerationCount > 0 && (
                <span className="text-[10px] uppercase tracking-wider text-on-surface-variant bg-surface-container-high px-2 py-1 rounded">
                  Revision {post.approval.regenerationCount}
                </span>
              )}
          </div>
        )}
      </div>

      {postLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <div className="pib-skeleton h-72 w-full" />
            <div className="pib-skeleton h-32 w-full" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <div className="pib-skeleton h-48 w-full" />
            <div className="pib-skeleton h-64 w-full" />
          </div>
        </div>
      ) : postError || !post ? (
        <div className="pib-card text-sm text-red-400">
          {postError || 'Post not found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left — Post preview (60%) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="pib-card space-y-5">
              {/* Platforms */}
              <div>
                <p className="eyebrow mb-2">Platforms</p>
                <div className="flex flex-wrap gap-2">
                  {platforms.length === 0 ? (
                    <span className="text-xs text-on-surface-variant">
                      No platforms set
                    </span>
                  ) : (
                    platforms.map((p) => <PlatformChip key={p} platform={p} />)
                  )}
                </div>
              </div>

              {/* Content */}
              <div>
                <p className="eyebrow mb-2">Content</p>
                <div className="rounded-xl bg-surface-container-low border border-outline-variant/40 p-4 text-sm text-on-surface leading-relaxed whitespace-pre-wrap break-words">
                  {text || (
                    <span className="text-on-surface-variant italic">
                      (empty content)
                    </span>
                  )}
                </div>
              </div>

              {/* Media */}
              {media.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">
                    Media · {media.length} {media.length === 1 ? 'item' : 'items'}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {media.map((m, i) => {
                      const url = typeof m === 'string' ? m : m?.url
                      const type = typeof m === 'string' ? 'image' : m?.type ?? 'image'
                      if (!url) return null
                      const isVideo = /^video/i.test(type) || /\.(mp4|mov|webm)$/i.test(url)
                      return (
                        <div
                          key={(typeof m === 'object' && m?.id) || `${url}-${i}`}
                          className="aspect-square rounded-lg overflow-hidden bg-surface-container-high border border-outline-variant/30"
                        >
                          {isVideo ? (
                            <video
                              src={url}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                            />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={url}
                              alt={`media ${i + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Hashtags */}
              {post.hashtags && post.hashtags.length > 0 && (
                <div>
                  <p className="eyebrow mb-2">Hashtags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {post.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 rounded-full bg-surface-container-high text-on-surface"
                      >
                        {tag.startsWith('#') ? tag : `#${tag}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Scheduled */}
              {post.scheduledFor && (
                <div>
                  <p className="eyebrow mb-2">Scheduled for</p>
                  <p className="text-sm text-on-surface">{fmtDateTime(post.scheduledFor)}</p>
                </div>
              )}

              {/* AI prompt */}
              {aiPrompt && (
                <div>
                  <p className="eyebrow mb-2">Original prompt</p>
                  <p className="text-xs font-mono text-on-surface-variant bg-surface-container-high rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap break-words">
                    {aiPrompt}
                  </p>
                </div>
              )}
            </div>

            {/* Original content (regenerated posts) */}
            {original && (
              <div className="pib-card">
                <button
                  onClick={() => setShowOriginal((v) => !v)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <p className="eyebrow">previous version</p>
                    <p className="text-sm text-on-surface mt-1">
                      View original (before regeneration)
                    </p>
                  </div>
                  <span className="text-on-surface-variant text-lg">
                    {showOriginal ? '−' : '+'}
                  </span>
                </button>
                {showOriginal && (
                  <div className="mt-3 rounded-xl bg-surface-container-low border border-outline-variant/40 p-4 text-sm text-on-surface-variant leading-relaxed whitespace-pre-wrap break-words">
                    {original}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right — Action panel (40%) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Actions */}
            <div className="pib-card space-y-3">
              <div>
                <p className="eyebrow">decision</p>
                <h2 className="font-headline text-lg text-on-surface mt-1">
                  Approve or send back
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  Approving sends the post to <span className="text-violet-400">client review</span>.
                </p>
              </div>

              <button
                onClick={handleApprove}
                disabled={approving || post.status !== 'qa_review'}
                className="w-full pib-btn-primary justify-center disabled:opacity-50"
              >
                {approving ? 'Approving…' : 'Approve for client review'}
              </button>

              <button
                onClick={() => setRejectOpen(true)}
                disabled={rejecting || post.status !== 'qa_review'}
                className="w-full pib-btn-secondary justify-center disabled:opacity-50"
              >
                Reject + regenerate
              </button>

              {post.status !== 'qa_review' && (
                <p className="text-[11px] text-on-surface-variant">
                  Status is{' '}
                  <span className="text-on-surface">
                    {post.status.replace(/_/g, ' ')}
                  </span>{' '}
                  — approve/reject is only available while in QA review.
                </p>
              )}

              <div className="pt-1">
                <button
                  onClick={handleManualRegenerate}
                  disabled={regenerating}
                  className="text-xs text-on-surface-variant hover:text-on-surface underline underline-offset-2 disabled:opacity-50"
                >
                  {regenerating ? 'Triggering…' : 'Manual regenerate'}
                </button>
              </div>
            </div>

            {/* Comment thread */}
            <div className="pib-card space-y-4">
              <div>
                <p className="eyebrow">activity</p>
                <h2 className="font-headline text-lg text-on-surface mt-1">
                  Comments
                </h2>
              </div>

              {commentsLoading ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="pib-skeleton h-16 w-full" />
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-on-surface-variant">
                  No comments yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {comments.map((c) => {
                    const kind: CommentKind = c.kind ?? 'note'
                    const meta = COMMENT_KIND_META[kind] ?? COMMENT_KIND_META.note
                    const isAi = (c.userRole ?? '').toLowerCase() === 'ai'
                    const isHandoff = kind === 'agent_handoff'
                    const tinted = isAi || isHandoff
                    return (
                      <li
                        key={c.id}
                        className={`rounded-lg border p-3 space-y-1.5 ${
                          tinted
                            ? 'bg-indigo-500/5 border-indigo-500/20'
                            : 'bg-surface-container-low border-outline-variant/40'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] ${meta.tone}`}
                            title={meta.label}
                          >
                            {meta.icon}
                          </span>
                          <span className="font-medium text-on-surface">
                            {c.userName || c.userId || 'Unknown'}
                          </span>
                          <RolePill role={c.userRole} />
                          <span className="text-on-surface-variant ml-auto">
                            {timeAgo(c.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap break-words">
                          {c.text}
                        </p>
                        {(kind !== 'note' || c.agentPickedUp) && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span
                              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.tone}`}
                            >
                              {meta.label}
                            </span>
                            {c.agentPickedUp && (
                              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                                agent picked up
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              {/* Add comment */}
              <div className="pt-2 border-t border-outline-variant/40 space-y-2">
                <label className="pib-label" htmlFor="new-note">
                  Add a note
                </label>
                <textarea
                  id="new-note"
                  rows={3}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave context for the team or the agent…"
                  className="pib-textarea"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handlePostComment}
                    disabled={postingComment || !newComment.trim()}
                    className="pib-btn-primary text-sm disabled:opacity-50"
                  >
                    {postingComment ? 'Posting…' : 'Post note'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
