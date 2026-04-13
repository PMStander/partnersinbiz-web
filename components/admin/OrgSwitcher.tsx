'use client'

import { useEffect, useState, useRef } from 'react'
import { useOrg } from '@/lib/contexts/OrgContext'

interface OrgSummary {
  id: string
  name: string
  slug: string
}

export function OrgSwitcher() {
  const { orgId, orgName, setOrg, clearOrg } = useOrg()
  const [orgs, setOrgs] = useState<OrgSummary[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/v1/organizations')
      .then((r) => r.json())
      .then((b) => setOrgs(b.data ?? []))
      .catch(() => {})
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = orgName || orgId || 'All Orgs'

  return (
    <div ref={ref} className="relative px-3 py-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-label bg-surface-container border border-outline-variant rounded text-on-surface hover:border-primary transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <span className="ml-1 opacity-50">▾</span>
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-1 z-50 bg-surface border border-outline-variant rounded shadow-lg overflow-hidden">
          <button
            onClick={() => { clearOrg(); setOpen(false) }}
            className="w-full text-left px-3 py-2 text-xs font-label text-on-surface-variant hover:bg-surface-container transition-colors border-b border-outline-variant"
          >
            All Orgs
          </button>
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => { setOrg(org.id, org.name); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs font-label transition-colors hover:bg-surface-container ${
                orgId === org.id ? 'text-primary' : 'text-on-surface'
              }`}
            >
              {org.name}
            </button>
          ))}
          {orgs.length === 0 && (
            <p className="px-3 py-2 text-xs text-on-surface-variant/50">No organisations yet</p>
          )}
        </div>
      )}
    </div>
  )
}
