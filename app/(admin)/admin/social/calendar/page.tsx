'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'

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
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
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
    return <span className="bg-black text-white text-[10px] px-1.5 py-0.5 rounded font-bold">X</span>
  }
  return <span className="bg-blue-700 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">LI</span>
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getCalendarDays(year: number, month: number): Date[] {
  // month: 0-indexed
  const firstDay = new Date(year, month, 1)
  // getDay() returns 0=Sun, adjust to Mon=0
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: Date[] = []
  // Fill leading days from previous month
  for (let i = startDow; i > 0; i--) {
    const d = new Date(year, month, 1 - i)
    days.push(d)
  }
  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i))
  }
  // Fill trailing days
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

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

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

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts, year, month])

  const days = getCalendarDays(year, month)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const postsForDay = (day: Date) => posts.filter((p) => {
    const d = tsToDate(p.scheduledFor)
    if (!d) return false
    return isSameDay(d, day)
  })

  const goPrev = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }
  const goNext = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const selectedPosts = selectedDay ? postsForDay(selectedDay) : []

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
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
      <div className="flex items-center gap-4">
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
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl bg-surface-container overflow-hidden">
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
            const isSelected = selectedDay && isSameDay(day, selectedDay)
            const dayPosts = loading ? [] : postsForDay(day)

            return (
              <div
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                className={`min-h-[80px] p-2 border-b border-r border-outline-variant/50 cursor-pointer transition-colors
                  ${isCurrentMonth ? 'hover:bg-surface-container-high' : 'hover:bg-surface-container'}
                  ${isSelected ? 'bg-surface-container-high' : ''}
                `}
              >
                <span className={`text-xs font-medium block mb-1 w-6 h-6 flex items-center justify-center rounded-full
                  ${!isCurrentMonth ? 'text-on-surface-variant/30' : isToday ? 'bg-white text-black ring-2 ring-white' : 'text-on-surface'}
                `}>
                  {day.getDate()}
                </span>
                <div className="space-y-0.5">
                  {dayPosts.slice(0, 2).map((post) => (
                    <div key={post.id} className="flex items-center gap-1">
                      <PlatformBadge platform={post.platform} />
                      <span className="text-[9px] text-on-surface-variant truncate">
                        {post.content.slice(0, 20)}
                      </span>
                    </div>
                  ))}
                  {dayPosts.length > 2 && (
                    <span className="text-[9px] text-on-surface-variant/60">+{dayPosts.length - 2} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <div className="rounded-xl bg-surface-container p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-on-surface">
              {selectedDay.toLocaleDateString('en-ZA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            </h3>
            <Link
              href={`/admin/social/compose`}
              className="px-3 py-1.5 rounded-lg bg-white text-black font-label text-xs font-medium hover:bg-white/90 transition-colors"
            >
              Compose
            </Link>
          </div>

          {selectedPosts.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No posts scheduled for this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedPosts.map((post) => (
                <div key={post.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-surface-container-high">
                  <PlatformBadge platform={post.platform} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-on-surface">{post.content.slice(0, 120)}{post.content.length > 120 ? '…' : ''}</p>
                    <p className="text-xs text-on-surface-variant mt-1 capitalize">{post.category}</p>
                  </div>
                  <StatusBadge status={post.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
