'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

interface SearchResult {
  id: string
  name?: string
  email?: string
  subject?: string
  company?: string
  [key: string]: any
}

interface SearchResults {
  contacts: SearchResult[]
  deals: SearchResult[]
  emails: SearchResult[]
  query: string
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim() || query.length < 2) { setResults(null); return }
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/v1/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((b) => { setResults(b.data); setLoading(false) })
        .catch(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const totalResults = results
    ? results.contacts.length + results.deals.length + results.emails.length
    : 0

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface-variant text-sm cursor-text min-w-[200px]"
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Search..."
          className="bg-transparent outline-none text-sm text-on-surface placeholder:text-on-surface-variant flex-1 min-w-0"
        />
        {loading && (
          <div className="w-3 h-3 border border-on-surface-variant border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute top-full mt-1 left-0 w-80 rounded-xl bg-surface-container border border-outline-variant shadow-lg z-50 overflow-hidden">
          {!results && loading ? (
            <div className="p-4 text-sm text-on-surface-variant text-center">Searching...</div>
          ) : results && totalResults === 0 ? (
            <div className="p-4 text-sm text-on-surface-variant text-center">No results for &quot;{query}&quot;</div>
          ) : results && totalResults > 0 ? (
            <div className="max-h-96 overflow-y-auto">
              {results.contacts.length > 0 && (
                <div>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Contacts</p>
                  {results.contacts.map((c) => (
                    <Link key={c.id} href={`/admin/crm/contacts/${c.id}`} onClick={() => { setOpen(false); setQuery('') }}
                      className="flex flex-col px-3 py-2 hover:bg-surface-container-high transition-colors">
                      <span className="text-sm font-medium text-on-surface">{c.name}</span>
                      <span className="text-xs text-on-surface-variant">{c.email}{c.company ? ` · ${c.company}` : ''}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.deals.length > 0 && (
                <div>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Deals</p>
                  {results.deals.map((d) => (
                    <Link key={d.id} href={`/admin/crm/pipeline`} onClick={() => { setOpen(false); setQuery('') }}
                      className="flex flex-col px-3 py-2 hover:bg-surface-container-high transition-colors">
                      <span className="text-sm font-medium text-on-surface">{d.name}</span>
                      <span className="text-xs text-on-surface-variant">{d.stage}{d.value ? ` · $${d.value.toLocaleString()}` : ''}</span>
                    </Link>
                  ))}
                </div>
              )}
              {results.emails.length > 0 && (
                <div>
                  <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">Emails</p>
                  {results.emails.map((e) => (
                    <Link key={e.id} href={`/admin/email`} onClick={() => { setOpen(false); setQuery('') }}
                      className="flex flex-col px-3 py-2 hover:bg-surface-container-high transition-colors">
                      <span className="text-sm font-medium text-on-surface">{e.subject}</span>
                      <span className="text-xs text-on-surface-variant">{e.to} · {e.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
