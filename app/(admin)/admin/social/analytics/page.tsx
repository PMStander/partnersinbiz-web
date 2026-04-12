'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback, useMemo } from 'react'

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

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

type DateRange = '7d' | '30d' | 'all'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
  return d
    ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'
}

function fmtDateTime(ts: any) {
  const d = tsToDate(ts)
  return d
    ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'
}

/** Build an external URL for a platform result if possible */
function platformPostUrl(platform: string, result: any): string | null {
  if (result?.url) return result.url
  if (result?.postUrl) return result.postUrl
  const extId = result?.externalId ?? result?.postId
  if (!extId) return null
  if (platform === 'x' || platform === 'twitter')
    return `https://x.com/i/web/status/${extId}`
  if (platform === 'linkedin')
    return `https://www.linkedin.com/feed/update/${extId}`
  return null
}

/* ------------------------------------------------------------------ */
/*  Small components                                                   */
/* ------------------------------------------------------------------ */

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = PLATFORM_COLORS[platform.toLowerCase()]
  if (!cfg) return <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-surface-container-high text-on-surface-variant uppercase">{platform}</span>
  return (
    <span className={`${cfg.bg} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-5 rounded-xl bg-surface-container">
      <p className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-on-surface mt-1">{value}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AnalyticsPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<DateRange>('30d')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/social/posts?status=published&limit=50')
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

  /* ---------- date-range filtering ---------- */
  const filtered = useMemo(() => {
    if (range === 'all') return posts
    const now = Date.now()
    const ms = range === '7d' ? 7 * 86400000 : 30 * 86400000
    return posts.filter((p) => {
      const d = tsToDate(p.publishedAt ?? p.scheduledFor ?? p.createdAt)
      return d ? now - d.getTime() <= ms : false
    })
  }, [posts, range])

  /* ---------- aggregate stats ---------- */
  const stats = useMemo(() => {
    const totalPublished = filtered.length
    // Future: sum real impressions / engagements from platformResults or analytics endpoint
    const totalImpressions = 0
    const totalEngagements = 0
    const avgEngagementRate = totalImpressions > 0
      ? ((totalEngagements / totalImpressions) * 100).toFixed(2) + '%'
      : '—'
    return { totalPublished, totalImpressions, totalEngagements, avgEngagementRate }
  }, [filtered])

  /* ---------- render ---------- */
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Analytics</h1>
        <p className="text-sm text-on-surface-variant mt-1">Per-post engagement data for published posts</p>
      </div>

      {/* Date range filter */}
      <div className="flex gap-1">
        {([
          { key: '7d', label: 'Last 7 days' },
          { key: '30d', label: 'Last 30 days' },
          { key: 'all', label: 'All time' },
        ] as const).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setRange(opt.key)}
            className={`px-3 py-1.5 rounded-lg font-label text-xs font-medium transition-colors ${
              range === opt.key
                ? 'bg-white text-black'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Published" value={stats.totalPublished} />
        <StatCard label="Total Impressions" value={stats.totalImpressions} />
        <StatCard label="Total Engagements" value={stats.totalEngagements} />
        <StatCard label="Avg Engagement Rate" value={stats.avgEngagementRate} />
      </div>

      {/* Notice */}
      <div className="rounded-xl bg-surface-container px-4 py-3 text-xs text-on-surface-variant">
        Impression and engagement metrics are placeholder values.{' '}
        <span className="font-medium text-on-surface">Analytics collection coming soon</span> — once enabled, real impressions, likes, comments, and shares will populate automatically.
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant text-sm">No published posts found.</div>
      ) : (
        <div className="rounded-xl bg-surface-container overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[90px_1fr_110px_80px_80px_80px_80px] gap-3 px-4 py-2.5 border-b border-outline-variant">
            {['Platform', 'Content', 'Published', 'Impr.', 'Likes', 'Comments', 'Shares'].map((h) => (
              <span key={h} className="text-[10px] font-medium text-on-surface-variant uppercase tracking-wide">{h}</span>
            ))}
          </div>

          {/* Data rows */}
          {filtered.map((post, i) => {
            const platforms = getPostPlatforms(post)
            const text = getPostText(post)
            const results: Record<string, any> = post.platformResults ?? {}

            return (
              <div
                key={post.id ?? i}
                className={`grid grid-cols-[90px_1fr_110px_80px_80px_80px_80px] gap-3 px-4 py-3 items-start ${i > 0 ? 'border-t border-outline-variant' : ''}`}
              >
                {/* Platforms */}
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {platforms.map((p) => (
                    <PlatformBadge key={p} platform={p} />
                  ))}
                </div>

                {/* Content preview + platform links */}
                <div className="min-w-0">
                  <p className="text-sm text-on-surface truncate">
                    {text.slice(0, 80)}{text.length > 80 ? '...' : ''}
                  </p>
                  {/* Platform post links */}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {Object.entries(results).map(([key, result]) => {
                      const url = platformPostUrl(key, result)
                      if (!url) return null
                      const cfg = PLATFORM_COLORS[key.toLowerCase()]
                      return (
                        <a
                          key={key}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-blue-400 hover:underline"
                        >
                          View on {cfg?.label ?? key}
                        </a>
                      )
                    })}
                  </div>
                </div>

                {/* Published date */}
                <span className="text-xs text-on-surface-variant pt-0.5">
                  {fmtDate(post.publishedAt ?? post.scheduledFor)}
                </span>

                {/* Metrics (placeholder zeros) */}
                <span className="text-xs text-on-surface-variant/40 pt-0.5">0</span>
                <span className="text-xs text-on-surface-variant/40 pt-0.5">0</span>
                <span className="text-xs text-on-surface-variant/40 pt-0.5">0</span>
                <span className="text-xs text-on-surface-variant/40 pt-0.5">0</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
