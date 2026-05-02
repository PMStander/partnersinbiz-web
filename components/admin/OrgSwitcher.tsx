'use client'

import { useEffect, useState, useRef } from 'react'
import { useOrg } from '@/lib/contexts/OrgContext'

export function OrgSwitcher() {
  const { selectedOrgId, orgName, orgs: contextOrgs, setOrg, clearOrg } = useOrg()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const label = orgName || selectedOrgId || 'All orgs'
  const initial = (orgName || 'A')[0]?.toUpperCase()

  return (
    <div ref={ref} className="relative px-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm bg-[var(--color-pib-surface)] border border-[var(--color-pib-line)] rounded-lg text-[var(--color-pib-text)] hover:border-[var(--color-pib-line-strong)] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="w-6 h-6 rounded-md bg-[var(--color-pib-accent-soft)] border border-[var(--color-pib-line)] flex items-center justify-center text-[10px] font-bold text-[var(--color-pib-accent-hover)] shrink-0">
          {initial}
        </span>
        <span className="truncate flex-1 text-left">{label}</span>
        <span className="material-symbols-outlined text-[18px] text-[var(--color-pib-text-muted)]">unfold_more</span>
      </button>

      {open && (
        <div className="absolute left-3 right-3 mt-1.5 z-50 bg-[var(--color-pib-surface)] border border-[var(--color-pib-line-strong)] rounded-xl shadow-2xl overflow-hidden">
          <button
            onClick={() => { clearOrg(); setOpen(false) }}
            className="w-full text-left px-3 py-2.5 text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] hover:bg-white/[0.03] transition-colors border-b border-[var(--color-pib-line)] flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">grid_view</span>
            All orgs
          </button>
          {contextOrgs.map((org) => (
            <button
              key={org.id}
              onClick={() => { setOrg(org.id, org.name); setOpen(false) }}
              className={[
                'w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-white/[0.03] flex items-center gap-2',
                selectedOrgId === org.id ? 'text-[var(--color-pib-accent-hover)]' : 'text-[var(--color-pib-text)]',
              ].join(' ')}
            >
              <span className="w-5 h-5 rounded-md bg-[var(--color-pib-surface-2)] border border-[var(--color-pib-line)] flex items-center justify-center text-[10px] font-bold text-[var(--color-pib-text-muted)]">
                {org.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              {org.name}
            </button>
          ))}
          {contextOrgs.length === 0 && (
            <p className="px-3 py-2.5 text-xs text-[var(--color-pib-text-muted)]">No organisations yet</p>
          )}
        </div>
      )}
    </div>
  )
}
