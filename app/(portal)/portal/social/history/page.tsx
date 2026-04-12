'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'

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

const STATUS_STYLES: Record<string, string> = {
  published: 'border-green-400/40 text-green-300',
  failed: 'border-red-400/40 text-red-300',
  scheduled: 'border-blue-400/40 text-blue-300',
  draft: 'border-white/20 text-white/40',
  cancelled: 'border-white/10 text-white/20 line-through',
}

function PlatformBadge({ platform }: { platform: string }) {
  const cfg = PLATFORM_COLORS[platform] ?? { bg: 'bg-gray-600', label: platform.slice(0, 2).toUpperCase() }
  return <span className={`${cfg.bg} text-white text-[10px] px-2 py-0.5 rounded font-bold`}>{cfg.label}</span>
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

function fmtDateTime(ts: any) {
  const d = tsToDate(ts)
  return d ? d.toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

export default function PortalPostHistory() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/social/posts?limit=100')
      const body = await res.json()
      setPosts(body.data ?? [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const filtered = statusFilter === 'all'
    ? posts
    : posts.filter(p => p.status === statusFilter)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Post History</h1>
        <p className="text-sm text-white/40 mt-1">View all your published and scheduled posts</p>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'published', 'scheduled', 'draft', 'failed', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-xs font-label uppercase tracking-widest border transition-colors capitalize ${
              statusFilter === s
                ? 'border-white text-white bg-white/10'
                : 'border-white/20 text-white/40 hover:text-white hover:border-white/40'
            }`}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Posts */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="border border-white/10 p-5 animate-pulse h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-white/10 p-12 text-center">
          <p className="text-white/40">No posts found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((post: any) => {
            const text = getPostText(post)
            const platforms = getPostPlatforms(post)
            const publishedAt = post.publishedAt ?? post.publishedAt
            const scheduledAt = post.scheduledAt ?? post.scheduledFor
            const platformResults = post.platformResults ?? {}

            return (
              <div key={post.id} className="border border-white/10 p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex gap-1">
                    {platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                  </div>
                  <p className="flex-1 text-sm text-white/80 truncate min-w-0">
                    {text.slice(0, 100)}{text.length > 100 ? '…' : ''}
                  </p>
                  <span className={`text-xs font-label uppercase tracking-widest border px-2 py-0.5 ${STATUS_STYLES[post.status] ?? 'border-white/20 text-white/40'}`}>
                    {post.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/30">
                  {post.status === 'published' && publishedAt && (
                    <span>Published: {fmtDateTime(publishedAt)}</span>
                  )}
                  {post.status === 'scheduled' && scheduledAt && (
                    <span>Scheduled: {fmtDateTime(scheduledAt)}</span>
                  )}
                  {post.status !== 'published' && post.status !== 'scheduled' && (
                    <span>Created: {fmtDateTime(post.createdAt)}</span>
                  )}
                  {/* Platform result links */}
                  {Object.values(platformResults).map((result: any) => (
                    result.platformPostUrl && (
                      <a
                        key={result.platformPostUrl}
                        href={result.platformPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/50 hover:text-white underline"
                      >
                        View on {result.platform}
                      </a>
                    )
                  ))}
                  {/* Legacy externalId link */}
                  {post.externalId && !Object.keys(platformResults).length && (
                    <a
                      href={
                        post.platform === 'x' || post.platform === 'twitter'
                          ? `https://x.com/i/status/${post.externalId}`
                          : '#'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/50 hover:text-white underline"
                    >
                      View post
                    </a>
                  )}
                </div>
                {post.error && (
                  <p className="text-xs text-red-300">{post.error}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
