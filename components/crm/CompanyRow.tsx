'use client'

import type { Company } from '@/lib/companies/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: unknown): string {
  if (!ts || typeof ts !== 'object') return '—'
  const s = (ts as Record<string, unknown>)._seconds
  if (typeof s !== 'number') return '—'
  return new Date(s * 1000).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// ── Tier / lifecycle colour chips ─────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export interface CompanyRowProps {
  company: Company
  onClick: (id: string) => void
}

export function CompanyRow({ company, onClick }: CompanyRowProps) {
  const tierCls = company.tier ? (TIER_COLOURS[company.tier] ?? 'bg-surface-container text-on-surface-variant') : ''
  const lcCls = company.lifecycleStage
    ? (LIFECYCLE_COLOURS[company.lifecycleStage] ?? 'bg-surface-container text-on-surface-variant')
    : ''

  return (
    <tr
      onClick={() => onClick(company.id)}
      className="cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-[var(--color-pib-line)] last:border-0"
    >
      {/* Logo / initials */}
      <td className="px-4 py-3 w-10">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={company.name}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center text-[10px] font-label text-on-surface-variant">
            {initials(company.name)}
          </div>
        )}
      </td>

      {/* Name */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-[var(--color-pib-text)] truncate max-w-xs">
          {company.name}
        </p>
        {company.domain && (
          <p className="text-[11px] text-[var(--color-pib-text-muted)] font-mono">{company.domain}</p>
        )}
      </td>

      {/* Tier */}
      <td className="px-4 py-3">
        {company.tier && (
          <span className={`text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full ${tierCls}`}>
            {company.tier}
          </span>
        )}
      </td>

      {/* Lifecycle */}
      <td className="px-4 py-3">
        {company.lifecycleStage && (
          <span className={`text-[10px] font-label uppercase tracking-wide px-2 py-0.5 rounded-full ${lcCls}`}>
            {company.lifecycleStage}
          </span>
        )}
      </td>

      {/* Industry */}
      <td className="px-4 py-3">
        <span className="text-sm text-[var(--color-pib-text-muted)] truncate max-w-[120px] block">
          {company.industry ?? '—'}
        </span>
      </td>

      {/* Employee count */}
      <td className="px-4 py-3">
        <span className="text-sm font-mono text-[var(--color-pib-text-muted)]">
          {company.employeeCount != null ? company.employeeCount.toLocaleString() : '—'}
        </span>
      </td>

      {/* Account manager */}
      <td className="px-4 py-3">
        {company.accountManagerRef ? (
          <div className="flex items-center gap-2">
            {company.accountManagerRef.avatarUrl ? (
              <img
                src={company.accountManagerRef.avatarUrl}
                alt={company.accountManagerRef.displayName}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--color-surface-container)] flex items-center justify-center text-[9px] font-label text-on-surface-variant">
                {initials(company.accountManagerRef.displayName)}
              </div>
            )}
            <span className="text-xs text-[var(--color-pib-text-muted)] truncate max-w-[100px]">
              {company.accountManagerRef.displayName}
            </span>
          </div>
        ) : (
          <span className="text-sm text-[var(--color-pib-text-muted)]">—</span>
        )}
      </td>

      {/* Open deals (placeholder — Wave 3 populates) */}
      <td className="px-4 py-3">
        <span className="text-sm font-mono text-[var(--color-pib-text-muted)]">—</span>
      </td>

      {/* Updated at */}
      <td className="px-4 py-3">
        <span className="text-xs text-[var(--color-pib-text-muted)]">{fmtDate(company.updatedAt)}</span>
      </td>
    </tr>
  )
}
