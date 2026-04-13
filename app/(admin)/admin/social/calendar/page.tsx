'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useOrg } from '@/lib/contexts/OrgContext'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
type ViewMode = 'month' | 'week'

interface SocialPost {
  id: string
  platform?: string
  platforms?: string[]
  content: string | { text: string }
  threadParts?: string[]
  scheduledFor?: any
  scheduledAt?: any
  status: SocialPostStatus
  publishedAt: any | null
  externalId: string | null
  error: string | null
  category: string
  tags: string[]
  createdBy: string
  createdAt: any
  updatedAt: any
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PLATFORM_ICONS: Record<string, { label: string; color: string; icon: string }> = {
  twitter: { label: 'X', color: '#000000', icon: '𝕏' },
  x: { label: 'X', color: '#000000', icon: '𝕏' },
  linkedin: { label: 'LI', color: '#0a66c2', icon: 'in' },
  facebook: { label: 'FB', color: '#1877f2', icon: 'f' },
  instagram: { label: 'IG', color: '#e4405f', icon: '📷' },
  reddit: { label: 'RD', color: '#ff4500', icon: 'r/' },
  tiktok: { label: 'TT', color: '#25f4ee', icon: '♪' },
  pinterest: { label: 'PI', color: '#bd081c', icon: 'P' },
  bluesky: { label: 'BS', color: '#0085ff', icon: '🦋' },
  threads: { label: 'TH', color: '#000000', icon: '@' },
}

const STATUS_COLORS: Record<SocialPostStatus, { bg: string; text: string; border: string }> = {
  scheduled: { bg: 'bg-blue-900/40', text: 'text-blue-300', border: 'border-blue-500/40' },
  published: { bg: 'bg-green-900/40', text: 'text-green-300', border: 'border-green-500/40' },
  failed: { bg: 'bg-red-900/40', text: 'text-red-300', border: 'border-red-500/40' },
  draft: { bg: 'bg-surface-container-high', text: 'text-on-surface-variant', border: 'border-outline-variant' },
  cancelled: { bg: 'bg-surface-container', text: 'text-on-surface-variant/40', border: 'border-outline-variant/30' },
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getPostText(post: SocialPost): string {
  if (typeof post.content === 'string') return post.content
  if (post.content && typeof post.content === 'object' && 'text' in post.content) return post.content.text
  return ''
}

function getPostPlatforms(post: SocialPost): string[] {
  if (post.platforms && Array.isArray(post.platforms) && post.platforms.length > 0) return post.platforms
  if (post.platform) return [post.platform]
  return []
}

function tsToDate(ts: any): Date | null {
  if (!ts) return null
  if (ts._seconds) return new Date(ts._seconds * 1000)
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function getScheduledDate(post: SocialPost): Date | null {
  return tsToDate(post.scheduledAt) ?? tsToDate(post.scheduledFor) ?? null
}

function fmtTime(ts: any) {
  const d = tsToDate(ts)
  return d ? d.toLocaleString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'
}

function fmtDateLong(d: Date) {
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6
  const days: Date[] = []
  for (let i = startDow; i > 0; i--) days.push(new Date(year, month, 1 - i))
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i))
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) days.push(new Date(year, month + 1, i))
  return days
}

function getWeekDays(year: number, month: number, day: number): Date[] {
  const d = new Date(year, month, day)
  let dow = d.getDay() - 1
  if (dow < 0) dow = 6
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    days.push(new Date(year, month, day - dow + i))
  }
  return days
}

/* ------------------------------------------------------------------ */
/*  Platform Icon Component                                            */
/* ------------------------------------------------------------------ */

function PlatformIcon({ platform }: { platform: string }) {
  const cfg = PLATFORM_ICONS[platform.toLowerCase()]
  if (!cfg) return null
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded text-[8px] font-bold leading-none text-white shrink-0"
      style={{ backgroundColor: cfg.color }}
      title={cfg.label}
    >
      {cfg.icon}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Post Chip (draggable)                                              */
/* ------------------------------------------------------------------ */

function PostChip({ post, onSelect, onDragStart }: {
  post: SocialPost
  onSelect: (p: SocialPost) => void
  onDragStart: (e: React.DragEvent, post: SocialPost) => void
}) {
  const text = getPostText(post)
  const platforms = getPostPlatforms(post)
  const colors = STATUS_COLORS[post.status] ?? STATUS_COLORS.draft

  return (
    <button
      draggable={post.status === 'draft' || post.status === 'scheduled'}
      onDragStart={(e) => onDragStart(e, post)}
      onClick={() => onSelect(post)}
      className={`w-full text-left flex items-center gap-1 px-1.5 py-1 rounded text-[9px] font-medium truncate transition-all
        hover:opacity-80 cursor-grab active:cursor-grabbing border
        ${colors.bg} ${colors.text} ${colors.border}`}
    >
      {platforms.map((p) => <PlatformIcon key={p} platform={p} />)}
      <span className="truncate">{text.slice(0, 40)}</span>
      <span className="ml-auto text-[8px] opacity-60 shrink-0">{fmtTime(post.scheduledAt ?? post.scheduledFor)}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Post Slide-Over                                                    */
/* ------------------------------------------------------------------ */

function PostSlideOver({ post, onClose, onPublish, onCancel, publishing, cancelling }: {
  post: SocialPost
  onClose: () => void
  onPublish: (p: SocialPost) => void
  onCancel: (p: SocialPost) => void
  publishing: string | null
  cancelling: string | null
}) {
  const text = getPostText(post)
  const platforms = getPostPlatforms(post)
  const schedDate = getScheduledDate(post)
  const colors = STATUS_COLORS[post.status] ?? STATUS_COLORS.draft

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-50 w-96 h-full bg-surface-container border-l border-outline-variant flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h2 className="text-sm font-semibold text-on-surface">Post Details</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface text-xl leading-none transition-colors">×</button>
        </div>

        <div className="p-5 space-y-4 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {platforms.map((p) => <PlatformIcon key={p} platform={p} />)}
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium capitalize ${colors.bg} ${colors.text}`}>{post.status}</span>
          </div>

          <div>
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Content</p>
            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>

          {schedDate && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Scheduled For</p>
              <p className="text-sm text-on-surface">
                {schedDate.toLocaleString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          )}

          {post.category && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Category</p>
              <p className="text-sm text-on-surface capitalize">{post.category}</p>
            </div>
          )}

          {post.error && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Error</p>
              <p className="text-xs text-red-400">{post.error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-outline-variant flex gap-2 flex-wrap">
          {['draft', 'scheduled', 'failed'].includes(post.status) && (
            <button
              onClick={() => onPublish(post)}
              disabled={publishing === post.id}
              className="px-3 py-2 rounded-lg bg-white text-black font-label text-xs font-medium hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              {publishing === post.id ? 'Publishing…' : 'Publish Now'}
            </button>
          )}
          <Link
            href={`/admin/social/compose`}
            className="px-3 py-2 rounded-lg bg-surface-container-high text-on-surface font-label text-xs font-medium hover:bg-surface-container transition-colors"
          >
            Edit
          </Link>
          {['draft', 'scheduled'].includes(post.status) && (
            <button
              onClick={() => onCancel(post)}
              disabled={cancelling === post.id}
              className="px-3 py-2 rounded-lg bg-red-900/30 text-red-400 font-label text-xs font-medium hover:bg-red-900/50 transition-colors disabled:opacity-50"
            >
              {cancelling === post.id ? 'Cancelling…' : 'Cancel Post'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const { orgId } = useOrg()
  const now = new Date()
  const router = useRouter()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [weekStart, setWeekStart] = useState(now.getDate() - ((now.getDay() + 6) % 7))
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [dragOverDay, setDragOverDay] = useState<string | null>(null)
  const dragPostRef = useRef<SocialPost | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/social/posts?limit=500${orgId ? `&orgId=${orgId}` : ''}`)
      const body = await res.json()
      setPosts(body.data ?? [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const days = viewMode === 'month'
    ? getCalendarDays(year, month)
    : getWeekDays(year, month, weekStart)

  const postsForDay = (day: Date) =>
    posts.filter((p) => {
      const d = getScheduledDate(p)
      return d ? isSameDay(d, day) : false
    })

  /* Navigation */
  const goPrev = () => {
    if (viewMode === 'month') {
      if (month === 0) { setMonth(11); setYear(y => y - 1) }
      else setMonth(m => m - 1)
    } else {
      const d = new Date(year, month, weekStart - 7)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      setWeekStart(d.getDate())
    }
    setSelectedPost(null)
  }

  const goNext = () => {
    if (viewMode === 'month') {
      if (month === 11) { setMonth(0); setYear(y => y + 1) }
      else setMonth(m => m + 1)
    } else {
      const d = new Date(year, month, weekStart + 7)
      setYear(d.getFullYear())
      setMonth(d.getMonth())
      setWeekStart(d.getDate())
    }
    setSelectedPost(null)
  }

  const goToday = () => {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setWeekStart(now.getDate() - ((now.getDay() + 6) % 7))
    setSelectedPost(null)
  }

  /* Actions */
  const handlePublish = async (post: SocialPost) => {
    setPublishing(post.id)
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'published' } : p))
    try {
      await fetch(`/api/v1/social/posts/${post.id}/publish${orgId ? `?orgId=${orgId}` : ''}`, { method: 'POST' })
    } finally {
      setPublishing(null)
      setSelectedPost(null)
      fetchPosts()
    }
  }

  const handleCancel = async (post: SocialPost) => {
    setCancelling(post.id)
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'cancelled' } : p))
    try {
      await fetch(`/api/v1/social/posts/${post.id}${orgId ? `?orgId=${orgId}` : ''}`, { method: 'DELETE' })
    } finally {
      setCancelling(null)
      setSelectedPost(null)
      fetchPosts()
    }
  }

  /* DnD: Reschedule post to a new day */
  const handleDragStart = (_e: React.DragEvent, post: SocialPost) => {
    dragPostRef.current = post
  }

  const handleDragOver = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault()
    setDragOverDay(dayKey)
  }

  const handleDragLeave = () => {
    setDragOverDay(null)
  }

  const handleDrop = async (e: React.DragEvent, targetDay: Date) => {
    e.preventDefault()
    setDragOverDay(null)
    const post = dragPostRef.current
    dragPostRef.current = null
    if (!post) return
    if (post.status !== 'draft' && post.status !== 'scheduled') return

    // Preserve original time, change date
    const origDate = getScheduledDate(post) ?? new Date()
    const newDate = new Date(
      targetDay.getFullYear(),
      targetDay.getMonth(),
      targetDay.getDate(),
      origDate.getHours(),
      origDate.getMinutes(),
    )

    // Optimistic update
    setPosts(prev => prev.map(p => {
      if (p.id !== post.id) return p
      return { ...p, scheduledAt: { seconds: Math.floor(newDate.getTime() / 1000) }, scheduledFor: { seconds: Math.floor(newDate.getTime() / 1000) }, status: 'scheduled' }
    }))

    try {
      await fetch(`/api/v1/social/posts/${post.id}${orgId ? `?orgId=${orgId}` : ''}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: newDate.toISOString(), status: 'scheduled' }),
      })
    } catch {
      fetchPosts() // Revert on failure
    }
  }

  /* Click-to-create */
  const handleDayClick = (day: Date) => {
    const iso = day.toISOString().slice(0, 16)
    router.push(`/admin/social/compose?scheduledAt=${iso}`)
  }

  /* Week header for week view */
  const weekRangeLabel = viewMode === 'week' && days.length >= 7
    ? `${days[0].toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })} – ${days[6].toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : ''

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {selectedPost && (
        <PostSlideOver
          post={selectedPost}
          onClose={() => setSelectedPost(null)}
          onPublish={handlePublish}
          onCancel={handleCancel}
          publishing={publishing}
          cancelling={cancelling}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Calendar</h1>
          <p className="text-sm text-on-surface-variant mt-1">Drag posts to reschedule, click a day to create</p>
        </div>
        <Link
          href="/admin/social/compose"
          className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors"
        >
          Compose Post
        </Link>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={goPrev}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
        >
          &lt; Prev
        </button>
        <h2 className="text-sm font-semibold text-on-surface min-w-[160px] text-center">
          {viewMode === 'month' ? `${MONTH_NAMES[month]} ${year}` : weekRangeLabel}
        </h2>
        <button
          onClick={goNext}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
        >
          Next &gt;
        </button>
        <button
          onClick={goToday}
          className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant font-label text-xs font-medium hover:bg-surface-container transition-colors"
        >
          Today
        </button>

        {/* View mode toggle */}
        <div className="ml-auto flex gap-1">
          {(['month', 'week'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => {
                setViewMode(mode)
                if (mode === 'week') setWeekStart(now.getDate() - ((now.getDay() + 6) % 7))
              }}
              className={`px-3 py-1.5 rounded-lg font-label text-xs font-medium transition-colors capitalize ${
                viewMode === mode ? 'bg-white text-black' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {loading && <span className="text-xs text-on-surface-variant/50">Loading…</span>}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[11px]">
        {[
          { label: 'Scheduled', cls: 'bg-blue-900/40 text-blue-300 border border-blue-500/40' },
          { label: 'Published', cls: 'bg-green-900/40 text-green-300 border border-green-500/40' },
          { label: 'Failed', cls: 'bg-red-900/40 text-red-300 border border-red-500/40' },
          { label: 'Draft', cls: 'bg-surface-container-high text-on-surface-variant border border-outline-variant' },
        ].map(({ label, cls }) => (
          <span key={label} className={`px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl bg-surface-container overflow-hidden border border-outline-variant/50">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-outline-variant">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const isCurrentMonth = day.getMonth() === month
            const isToday = isSameDay(day, today)
            const dayPosts = loading ? [] : postsForDay(day)
            const dayKey = day.toISOString().slice(0, 10)
            const isDragOver = dragOverDay === dayKey
            const visiblePosts = viewMode === 'week' ? dayPosts : dayPosts.slice(0, 3)
            const extraCount = dayPosts.length - visiblePosts.length
            const minH = viewMode === 'week' ? 'min-h-[200px]' : 'min-h-[90px]'

            return (
              <div
                key={i}
                className={`${minH} p-1.5 border-b border-r border-outline-variant/30 transition-colors
                  ${isCurrentMonth ? 'bg-transparent' : 'bg-surface/30'}
                  ${isDragOver ? 'bg-blue-900/20 ring-1 ring-blue-500/40 ring-inset' : 'hover:bg-surface-container-high/30'}
                `}
                onDragOver={(e) => handleDragOver(e, dayKey)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
                onDoubleClick={() => handleDayClick(day)}
              >
                <span className={`text-xs font-medium block mb-1 w-6 h-6 flex items-center justify-center rounded-full
                  ${!isCurrentMonth ? 'text-on-surface-variant/25' : isToday ? 'bg-white text-black' : 'text-on-surface'}
                `}>
                  {day.getDate()}
                </span>
                <div className="space-y-0.5">
                  {visiblePosts.map((post) => (
                    <PostChip
                      key={post.id}
                      post={post}
                      onSelect={setSelectedPost}
                      onDragStart={handleDragStart}
                    />
                  ))}
                  {extraCount > 0 && (
                    <span className="text-[9px] text-on-surface-variant/50 pl-1">+{extraCount} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      {!loading && (
        <p className="text-xs text-on-surface-variant text-right">
          {viewMode === 'month'
            ? `${posts.filter(p => { const d = getScheduledDate(p); return d && d.getFullYear() === year && d.getMonth() === month }).length} posts in ${MONTH_NAMES[month]}`
            : `${days.reduce((sum, day) => sum + postsForDay(day).length, 0)} posts this week`}
        </p>
      )}
    </div>
  )
}
