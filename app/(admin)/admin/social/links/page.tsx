'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState, useCallback } from 'react'

interface ShortenedLink {
  id: string
  shortCode: string
  shortUrl: string
  originalUrl: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  clickCount: number
  createdAt: any
  createdBy: string
}

interface LinkStats {
  totalClicks: number
  clicksByDay: Array<{ date: string; count: number }>
  topReferrers: Array<{ referrer: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  recentClicks: Array<{
    timestamp: any
    referrer: string | null
    country: string | null
  }>
}

interface SelectedLinkData extends ShortenedLink {
  stats: LinkStats
}

export default function AdminLinksPage() {
  const [links, setLinks] = useState<ShortenedLink[]>([])
  const [selectedLink, setSelectedLink] = useState<SelectedLinkData | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalLinks, setTotalLinks] = useState(0)

  // Form state
  const [originalUrl, setOriginalUrl] = useState('')
  const [utmSource, setUtmSource] = useState('')
  const [utmMedium, setUtmMedium] = useState('')
  const [utmCampaign, setUtmCampaign] = useState('')
  const [utmTerm, setUtmTerm] = useState('')
  const [utmContent, setUtmContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const LIMIT = 20

  // Fetch links
  const fetchLinks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/links?page=${page}&limit=${LIMIT}`)
      const data = await res.json()
      if (data.success) {
        setLinks(data.data)
        setTotalLinks(data.meta?.total || 0)
      }
    } catch (err) {
      console.error('Failed to fetch links:', err)
    } finally {
      setLoading(false)
    }
  }, [page])

  // Fetch link details with stats
  const fetchLinkStats = useCallback(async (linkId: string) => {
    try {
      const res = await fetch(`/api/v1/links/${linkId}`)
      const data = await res.json()
      if (data.success) {
        setSelectedLink(data.data)
      }
    } catch (err) {
      console.error('Failed to fetch link stats:', err)
    }
  }, [])

  useEffect(() => {
    fetchLinks()
  }, [fetchLinks])

  // Build preview URL with UTM params
  const buildPreviewUrl = (): string => {
    if (!originalUrl) return ''
    try {
      const url = new URL(originalUrl)
      if (utmSource) url.searchParams.set('utm_source', utmSource)
      if (utmMedium) url.searchParams.set('utm_medium', utmMedium)
      if (utmCampaign) url.searchParams.set('utm_campaign', utmCampaign)
      if (utmTerm) url.searchParams.set('utm_term', utmTerm)
      if (utmContent) url.searchParams.set('utm_content', utmContent)
      return url.toString()
    } catch {
      return ''
    }
  }

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!originalUrl) {
      setError('Original URL is required')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/v1/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalUrl,
          utmSource: utmSource || undefined,
          utmMedium: utmMedium || undefined,
          utmCampaign: utmCampaign || undefined,
          utmTerm: utmTerm || undefined,
          utmContent: utmContent || undefined,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setSuccess('Link created successfully!')
        // Reset form
        setOriginalUrl('')
        setUtmSource('')
        setUtmMedium('')
        setUtmCampaign('')
        setUtmTerm('')
        setUtmContent('')
        // Refresh links
        setPage(1)
        await fetchLinks()
      } else {
        setError(data.error || 'Failed to create link')
      }
    } catch (err) {
      setError('Failed to create link')
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return

    try {
      const res = await fetch(`/api/v1/links/${linkId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        setSelectedLink(null)
        await fetchLinks()
      } else {
        setError('Failed to delete link')
      }
    } catch (err) {
      setError('Failed to delete link')
      console.error(err)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setSuccess('Copied to clipboard!')
    setTimeout(() => setSuccess(''), 2000)
  }

  const previewUrl = buildPreviewUrl()

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Link Shortener</h1>
        <p className="text-sm text-on-surface-variant mt-1">Create and manage shortened links with UTM tracking</p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Section */}
        <div className="lg:col-span-2">
          <div className="p-6 rounded-lg bg-surface-container">
            <h2 className="text-lg font-semibold text-on-surface mb-4">Create Shortened Link</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-400/50 text-red-200 rounded text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 bg-green-900/30 border border-green-400/50 text-green-200 rounded text-sm">
                {success}
              </div>
            )}

            <form onSubmit={handleCreateLink} className="space-y-4">
              {/* Original URL */}
              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Original URL</label>
                <input
                  type="url"
                  value={originalUrl}
                  onChange={(e) => setOriginalUrl(e.target.value)}
                  placeholder="https://example.com/page"
                  className="w-full px-3 py-2 bg-surface-container-high border border-outline-variant rounded text-on-surface placeholder-on-surface-variant focus:border-[#F59E0B] focus:outline-none"
                />
              </div>

              {/* UTM Parameters */}
              <div className="border-t border-outline-variant pt-4">
                <h3 className="text-sm font-semibold text-on-surface mb-3">UTM Parameters (Optional)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Source</label>
                    <input
                      type="text"
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      placeholder="e.g., twitter"
                      className="w-full px-2 py-1 bg-surface-container-high border border-outline-variant rounded text-sm text-on-surface placeholder-on-surface-variant focus:border-[#F59E0B] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Medium</label>
                    <input
                      type="text"
                      value={utmMedium}
                      onChange={(e) => setUtmMedium(e.target.value)}
                      placeholder="e.g., social"
                      className="w-full px-2 py-1 bg-surface-container-high border border-outline-variant rounded text-sm text-on-surface placeholder-on-surface-variant focus:border-[#F59E0B] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Campaign</label>
                    <input
                      type="text"
                      value={utmCampaign}
                      onChange={(e) => setUtmCampaign(e.target.value)}
                      placeholder="e.g., launch"
                      className="w-full px-2 py-1 bg-surface-container-high border border-outline-variant rounded text-sm text-on-surface placeholder-on-surface-variant focus:border-[#F59E0B] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Term</label>
                    <input
                      type="text"
                      value={utmTerm}
                      onChange={(e) => setUtmTerm(e.target.value)}
                      placeholder="e.g., keyword"
                      className="w-full px-2 py-1 bg-surface-container-high border border-outline-variant rounded text-sm text-on-surface placeholder-on-surface-variant focus:border-[#F59E0B] focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-on-surface-variant mb-1">Content</label>
                    <input
                      type="text"
                      value={utmContent}
                      onChange={(e) => setUtmContent(e.target.value)}
                      placeholder="e.g., banner"
                      className="w-full px-2 py-1 bg-surface-container-high border border-outline-variant rounded text-sm text-on-surface placeholder-on-surface-variant focus:border-[#F59E0B] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              {previewUrl && (
                <div className="bg-surface-container-high border border-outline-variant rounded p-3">
                  <p className="text-xs text-on-surface-variant mb-1">Preview with UTM params:</p>
                  <p className="text-xs text-[#F59E0B] break-all">{previewUrl}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={creating || !originalUrl}
                className="w-full px-4 py-2 rounded-lg bg-[#F59E0B] text-black font-label text-sm font-medium hover:bg-[#F59E0B]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creating ? 'Creating...' : 'Shorten Link'}
              </button>
            </form>
          </div>
        </div>

        {/* Stats Section */}
        {selectedLink && (
          <div className="p-6 rounded-lg bg-surface-container h-fit">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-on-surface">Stats</h2>
              <button
                onClick={() => setSelectedLink(null)}
                className="text-on-surface-variant hover:text-on-surface"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div className="bg-surface-container-high p-3 rounded">
                <p className="text-on-surface-variant">Total Clicks</p>
                <p className="text-2xl font-bold text-[#F59E0B]">{selectedLink.stats.totalClicks}</p>
              </div>

              {selectedLink.stats.topReferrers.length > 0 && (
                <div>
                  <p className="text-on-surface-variant font-medium mb-2">Top Referrers</p>
                  <div className="space-y-1">
                    {selectedLink.stats.topReferrers.slice(0, 5).map((ref, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-on-surface truncate">{ref.referrer}</span>
                        <span className="text-[#F59E0B]">{ref.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedLink.stats.topCountries.length > 0 && (
                <div>
                  <p className="text-on-surface-variant font-medium mb-2">Top Countries</p>
                  <div className="space-y-1">
                    {selectedLink.stats.topCountries.slice(0, 5).map((country, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <span className="text-on-surface">{country.country}</span>
                        <span className="text-[#F59E0B]">{country.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Links Table */}
      <div className="rounded-lg bg-surface-container overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-high">
                <th className="px-4 py-3 text-left font-semibold text-on-surface">Short URL</th>
                <th className="px-4 py-3 text-left font-semibold text-on-surface">Original URL</th>
                <th className="px-4 py-3 text-right font-semibold text-on-surface">Clicks</th>
                <th className="px-4 py-3 text-left font-semibold text-on-surface">Created</th>
                <th className="px-4 py-3 text-right font-semibold text-on-surface">Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                    No shortened links yet. Create one above!
                  </td>
                </tr>
              ) : (
                links.map((link) => (
                  <tr
                    key={link.id}
                    className="border-b border-outline-variant hover:bg-surface-container-high cursor-pointer transition-colors"
                    onClick={() => fetchLinkStats(link.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-[#F59E0B] font-mono text-xs bg-surface-container-high px-2 py-1 rounded">
                          {link.shortCode}
                        </code>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            copyToClipboard(link.shortUrl)
                          }}
                          className="text-on-surface-variant hover:text-on-surface text-xs"
                          title="Copy to clipboard"
                        >
                          📋
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline truncate max-w-xs block text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {link.originalUrl.substring(0, 50)}
                        {link.originalUrl.length > 50 ? '...' : ''}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-[#F59E0B] font-semibold">
                      {link.clickCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">
                      {new Date(link.createdAt.seconds * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteLink(link.id)
                        }}
                        className="text-red-400 hover:text-red-300 text-xs font-medium"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalLinks > LIMIT && (
          <div className="px-4 py-3 border-t border-outline-variant flex justify-between items-center bg-surface-container-high">
            <p className="text-xs text-on-surface-variant">
              Showing {(page - 1) * LIMIT + 1} to {Math.min(page * LIMIT, totalLinks)} of {totalLinks}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => (p * LIMIT < totalLinks ? p + 1 : p))}
                disabled={page * LIMIT >= totalLinks}
                className="px-3 py-1 bg-surface-container border border-outline-variant text-on-surface hover:bg-surface-container-high disabled:opacity-50 disabled:cursor-not-allowed text-xs rounded"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
