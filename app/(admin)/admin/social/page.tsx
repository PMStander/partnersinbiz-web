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
  if (ts._seconds) return new Date(ts._seconds * 1000)
  if (ts.seconds) return new Date(ts.seconds * 1000)
  return new Date(ts)
}

function getScheduledDate(post: SocialPost): Date | null {
  return tsToDate(post.scheduledAt) ?? tsToDate(post.scheduledFor) ?? null
}

function fmtDateTime(ts: any) {
  const d = tsToDate(ts)
  return d ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="p-5 rounded-xl bg-surface-container">
      <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold text-on-surface">{value}</p>
      {sub && <p className="text-xs text-on-surface-variant mt-1">{sub}</p>}
    </div>
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

function PlatformBadge({ platform }: { platform: string }) {
  const config = PLATFORM_COLORS[platform.toLowerCase()] ?? { bg: 'bg-surface-container-high', label: platform.slice(0, 2).toUpperCase() }
  return (
    <span className={`${config.bg} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>
      {config.label}
    </span>
  )
}

export default function SocialOverviewPage() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [accountCount, setAccountCount] = useState<number | null>(null)
  const [unreadInboxCount, setUnreadInboxCount] = useState<number | null>(null)

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

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/accounts')
      const body = await res.json()
      const accounts = body.data ?? body.accounts ?? []
      setAccountCount(Array.isArray(accounts) ? accounts.length : 0)
    } catch {
      setAccountCount(null)
    }
  }, [])

  const fetchUnreadInbox = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/social/inbox?status=unread&limit=1')
      const body = await res.json()
      const items = body.items ?? []
      setUnreadInboxCount(items.length)
    } catch {
      setUnreadInboxCount(null)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
    fetchAccounts()
    fetchUnreadInbox()
  }, [fetchPosts, fetchAccounts, fetchUnreadInbox])

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const scheduled = posts.filter((p) => p.status === 'scheduled').length
  const publishedToday = posts.filter((p) => {
    if (p.status !== 'published') return false
    const d = tsToDate(p.publishedAt)
    return d && d >= today && d < tomorrow
  }).length
  const failed = posts.filter((p) => p.status === 'failed').length
  const drafts = posts.filter((p) => p.status === 'draft').length

  const recent = [...posts]
    .sort((a, b) => {
      const da = getScheduledDate(a)?.getTime() ?? 0
      const db = getScheduledDate(b)?.getTime() ?? 0
      return db - da
    })
    .slice(0, 10)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Social Overview</h1>
        <p className="text-sm text-on-surface-variant mt-1">Monitor and manage your social media presence</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Scheduled" value={scheduled} sub="upcoming posts" />
          <StatCard label="Published Today" value={publishedToday} sub="posts live today" />
          <StatCard label="Failed" value={failed} sub="need attention" />
          <StatCard label="Drafts" value={drafts} sub="in progress" />
          <StatCard label="Accounts" value={accountCount ?? '—'} sub="connected" />
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Quick Actions</h2>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/admin/social/compose"
            className="px-4 py-2 rounded-lg bg-white text-black font-label text-sm font-medium hover:bg-white/90 transition-colors"
          >
            Compose Post
          </Link>
          <Link
            href="/admin/social/inbox"
            className="relative px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Inbox
            {unreadInboxCount !== null && unreadInboxCount > 0 && (
              <span className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4 bg-red-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {unreadInboxCount}
              </span>
            )}
          </Link>
          <Link
            href="/admin/social/queue"
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            View Queue
          </Link>
          <Link
            href="/admin/social/calendar"
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Calendar
          </Link>
          <Link
            href="/admin/social/design"
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Design
          </Link>
          <Link
            href="/admin/social/accounts"
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Accounts
          </Link>
          <Link
            href="/admin/social/analytics"
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Analytics
          </Link>
          <Link
            href="/admin/social/links"
            className="px-4 py-2 rounded-lg bg-surface-container text-on-surface font-label text-sm font-medium hover:bg-surface-container-high transition-colors"
          >
            Links
          </Link>
        </div>
      </div>

      {/* Recent Posts */}
      <div>
        <h2 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Recent Posts</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-on-surface-variant text-sm text-center py-8">No posts yet.</p>
        ) : (
          <div className="rounded-xl bg-surface-container overflow-hidden">
            {recent.map((post, i) => {
              const text = getPostText(post)
              const platforms = getPostPlatforms(post)
              const schedDate = getScheduledDate(post)
              return (
                <div
                  key={post.id}
                  className={`flex items-center gap-4 px-5 py-3 ${i > 0 ? 'border-t border-outline-variant' : ''}`}
                >
                  <div className="flex items-center gap-1 shrink-0">
                    {platforms.map((p) => (
                      <PlatformBadge key={p} platform={p} />
                    ))}
                  </div>
                  <p className="flex-1 text-sm text-on-surface truncate min-w-0">
                    {text.slice(0, 80)}{text.length > 80 ? '…' : ''}
                  </p>
                  <StatusBadge status={post.status} />
                  <span className="text-xs text-on-surface-variant flex-shrink-0 w-28 text-right">
                    {schedDate ? fmtDateTime(post.scheduledAt ?? post.scheduledFor) : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
