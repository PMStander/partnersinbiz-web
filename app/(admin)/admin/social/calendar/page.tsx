'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

type SocialPostStatus = 'draft' | 'scheduled' | 'published' | 'failed' | 'cancelled'
type SocialPostCategory = 'work' | 'personal' | 'ai' | 'sport' | 'sa' | 'other'

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
  category: SocialPostCategory
  tags: string[]
  createdBy: string
  createdAt: any
  updatedAt: any
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
  if (ts._seconds) return new Date(ts._seconds * 1000)   // Firestore REST serialization
  if (ts.seconds) return new Date(ts.seconds * 1000)     // Firestore SDK serialization
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

function PlatformBadge({ platform }: { platform: string }) {
  const config = PLATFORM_COLORS[platform.toLowerCase()] ?? { bg: 'bg-surface-container-high', label: platform.slice(0, 2).toUpperCase() }
  return (
    <span className={`${config.bg} text-white text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0`}>
      {config.label}
    </span>
  )
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

// Chip color by status
function postChipClass(status: SocialPostStatus) {
  switch (status) {
    case 'scheduled': return 'bg-blue-900/40 text-blue-300'
    case 'published': return 'bg-green-900/40 text-green-300'
    case 'failed': return 'bg-red-900/40 text-red-300'
    case 'cancelled': return 'bg-surface-container text-on-surface-variant/40 line-through'
    default: return 'bg-surface-container-high text-on-surface-variant'
  }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: Date[] = []
  for (let i = startDow; i > 0; i--) {
    days.push(new Date(year, month, 1 - i))
  }
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i))
  }
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i))
  }
  return days
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

// Slide-over panel for a selected post
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

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-50 w-96 h-full bg-surface-container border-l border-outline-variant flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <h2 className="text-sm font-semibold text-on-surface">Post Details</h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-4 flex-1">
          <div className="flex items-center gap-2">
            {platforms.map((p) => (
              <PlatformBadge key={p} platform={p} />
            ))}
            <StatusBadge status={post.status} />
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

          {post.tags && post.tags.length > 0 && (
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {post.tags.map((tag) => (
                  <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">
                    {tag}
                  </span>
                ))}
              </div>
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
            href={`/admin/social/queue`}
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

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null)
  const [publishing, setPublishing] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/social/posts?limit=500')
      const body = await res.json()
      setPosts(body.data ?? [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const days = getCalendarDays(year, month)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const postsForDay = (day: Date) =>
    posts.filter((p) => {
      const d = getScheduledDate(p)
      return d ? isSameDay(d, day) : false
    })

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedPost(null)
  }
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedPost(null)
  }
  const goToday = () => {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setSelectedPost(null)
  }

  const handlePublish = async (post: SocialPost) => {
    setPublishing(post.id)
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, status: 'published' } : p))
    try {
      await fetch(`/api/v1/social/posts/${post.id}/publish`, { method: 'POST' })
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
      await fetch(`/api/v1/social/posts/${post.id}`, { method: 'DELETE' })
    } finally {
      setCancelling(null)
      setSelectedPost(null)
      fetchPosts()
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
          <p className="text-sm text-on-surface-variant mt-1">Visualise your posting schedule</p>
        </div>
        <Link
          href="/admin/social/compose"
          className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors"
        >
          Compose Post
        </Link>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-3">
        <button
          onClick={goPrev}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
        >
          &lt; Prev
        </button>
        <h2 className="text-sm font-semibold text-on-surface min-w-[140px] text-center">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button
          onClick={goNext}
          className="px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
        >
          Next &gt;
        </button>
        <button
          onClick={goToday}
          className="ml-2 px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant font-label text-xs font-medium hover:bg-surface-container transition-colors"
        >
          Today
        </button>
        {loading && (
          <span className="text-xs text-on-surface-variant/50 ml-2">Loading…</span>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[11px]">
        {[
          { label: 'Scheduled', cls: 'bg-blue-900/40 text-blue-300' },
          { label: 'Published', cls: 'bg-green-900/40 text-green-300' },
          { label: 'Failed', cls: 'bg-red-900/40 text-red-300' },
          { label: 'Draft', cls: 'bg-surface-container-high text-on-surface-variant' },
        ].map(({ label, cls }) => (
          <span key={label} className={`px-2 py-0.5 rounded font-medium ${cls}`}>{label}</span>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl bg-surface-container overflow-hidden border border-outline-variant/50">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-outline-variant">
          {DAY_HEADERS.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const isCurrentMonth = day.getMonth() === month
            const isToday = isSameDay(day, today)
            const dayPosts = loading ? [] : postsForDay(day)
            const visiblePosts = dayPosts.slice(0, 3)
            const extraCount = dayPosts.length - visiblePosts.length

            return (
              <div
                key={i}
                className={`min-h-[90px] p-1.5 border-b border-r border-outline-variant/30
                  ${isCurrentMonth ? 'bg-transparent hover:bg-surface-container-high/30' : 'bg-surface/30'}
                  transition-colors
                `}
              >
                <span className={`text-xs font-medium block mb-1 w-6 h-6 flex items-center justify-center rounded-full
                  ${!isCurrentMonth ? 'text-on-surface-variant/25' : isToday ? 'bg-white text-black' : 'text-on-surface'}
                `}>
                  {day.getDate()}
                </span>
                <div className="space-y-0.5">
                  {visiblePosts.map((post) => {
                    const text = getPostText(post)
                    const platforms = getPostPlatforms(post)
                    return (
                      <button
                        key={post.id}
                        onClick={() => setSelectedPost(post)}
                        className={`w-full text-left flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium truncate transition-opacity hover:opacity-80 ${postChipClass(post.status)}`}
                      >
                        {platforms.map((p) => (
                          <PlatformBadge key={p} platform={p} />
                        ))}
                        <span className="truncate">{text.slice(0, 40)}</span>
                      </button>
                    )
                  })}
                  {extraCount > 0 && (
                    <span className="text-[9px] text-on-surface-variant/50 pl-1">
                      +{extraCount} more
                    </span>
                  )}
                  {dayPosts.length >= 2 && extraCount === 0 && (
                    <span className="text-[9px] text-on-surface-variant/40 pl-1">
                      {dayPosts.length} posts
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Month summary */}
      {!loading && (
        <p className="text-xs text-on-surface-variant text-right">
          {posts.filter(p => {
            const d = getScheduledDate(p)
            return d && d.getFullYear() === year && d.getMonth() === month
          }).length} posts in {MONTH_NAMES[month]}
        </p>
      )}
    </div>
  )
}
