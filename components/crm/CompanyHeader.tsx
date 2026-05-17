'use client'

import type { Company } from '@/lib/companies/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const TIER_COLOURS: Record<string, string> = {
  enterprise: 'bg-purple-500/20 text-purple-300',
  'mid-market': 'bg-blue-500/20 text-blue-300',
  smb: 'bg-green-500/20 text-green-300',
}

const LIFECYCLE_COLOURS: Record<string, string> = {
  lead: 'bg-yellow-500/20 text-yellow-300',
  prospect: 'bg-sky-500/20 text-sky-300',
  customer: 'bg-green-500/20 text-green-300',
  churned: 'bg-red-500/20 text-red-300',
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CompanyHeaderProps {
  company: Company
  onEdit: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompanyHeader({ company, onEdit }: CompanyHeaderProps) {
  const tierCls = company.tier
    ? (TIER_COLOURS[company.tier] ?? 'bg-[var(--color-surface-container)] text-on-surface-variant')
    : ''
  const lcCls = company.lifecycleStage
    ? (LIFECYCLE_COLOURS[company.lifecycleStage] ?? 'bg-[var(--color-surface-container)] text-on-surface-variant')
    : ''
  const am = company.accountManagerRef

  return (
    <div className="flex items-start gap-4">
      {/* Logo / initials */}
      {company.logoUrl ? (
        <img
          src={company.logoUrl}
          alt={company.name}
          className="w-16 h-16 rounded-2xl object-cover shrink-0"
        />
      ) : (
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-container)] flex items-center justify-center text-xl font-label text-on-surface-variant shrink-0">
          {initials(company.name)}
        </div>
      )}

      {/* Name + chips */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-semibold text-[var(--color-pib-text)] truncate">{company.name}</h1>

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {company.tier && (
            <span className={`text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full ${tierCls}`}>
              {company.tier}
            </span>
          )}
          {company.lifecycleStage && (
            <span className={`text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full ${lcCls}`}>
              {company.lifecycleStage}
            </span>
          )}
          {am && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-pib-text-muted)]">
              {am.avatarUrl ? (
                <img src={am.avatarUrl} alt={am.displayName} className="w-5 h-5 rounded-full object-cover" />
              ) : (
                <div className="w-5 h-5 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center text-[9px] font-label text-on-surface-variant">
                  {initials(am.displayName)}
                </div>
              )}
              <span>{am.displayName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Edit button */}
      <button
        type="button"
        onClick={onEdit}
        className="cursor-pointer btn-pib-secondary flex items-center gap-1.5 shrink-0"
      >
        <span className="material-symbols-outlined text-[16px]">edit</span>
        Edit
      </button>
    </div>
  )
}
