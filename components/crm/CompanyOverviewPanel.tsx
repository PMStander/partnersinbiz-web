'use client'

import Link from 'next/link'
import type { Company } from '@/lib/companies/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pib-card-section">
      <div className="px-5 py-3 border-b border-[var(--color-pib-line)] bg-white/[0.02]">
        <p className="eyebrow !text-[10px]">{title}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="text-[11px] text-[var(--color-pib-text-muted)] w-28 shrink-0">{label}</span>
      <span className="text-sm text-[var(--color-pib-text)]">{value}</span>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CompanyOverviewPanelProps {
  company: Company
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompanyOverviewPanel({ company }: CompanyOverviewPanelProps) {
  const addr = company.address
  const social = company.socialProfiles
  const customFields = company.customFields ? Object.entries(company.customFields) : []

  const hasAddress = addr && (addr.street || addr.city || addr.country)
  const hasSocial = social && (social.linkedin || social.twitter || social.facebook || social.instagram)
  const hasContact = company.phone || company.website

  return (
    <div className="space-y-4">
      {/* Address */}
      {hasAddress && (
        <SectionCard title="Address">
          {addr?.street && <Field label="Street" value={addr.street} />}
          {addr?.city && <Field label="City" value={addr.city} />}
          {addr?.state && <Field label="State / Province" value={addr.state} />}
          {addr?.country && <Field label="Country" value={addr.country} />}
          {addr?.postalCode && <Field label="Postal code" value={addr.postalCode} />}
        </SectionCard>
      )}

      {/* Contact info */}
      {hasContact && (
        <SectionCard title="Contact">
          {company.phone && <Field label="Phone" value={company.phone} />}
          {company.website && (
            <div className="flex items-baseline gap-3 py-1">
              <span className="text-[11px] text-[var(--color-pib-text-muted)] w-28 shrink-0">Website</span>
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-accent-v2)] hover:underline"
              >
                {company.website}
              </a>
            </div>
          )}
        </SectionCard>
      )}

      {/* Social profiles */}
      {hasSocial && (
        <SectionCard title="Social">
          {social?.linkedin && (
            <div className="flex items-center gap-2 py-1">
              <span className="material-symbols-outlined text-[16px] text-[var(--color-pib-text-muted)]">link</span>
              <a href={social.linkedin} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[var(--color-accent-v2)] hover:underline">
                LinkedIn
              </a>
            </div>
          )}
          {social?.twitter && (
            <div className="flex items-center gap-2 py-1">
              <span className="material-symbols-outlined text-[16px] text-[var(--color-pib-text-muted)]">link</span>
              <a href={social.twitter} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[var(--color-accent-v2)] hover:underline">
                X / Twitter
              </a>
            </div>
          )}
          {social?.facebook && (
            <div className="flex items-center gap-2 py-1">
              <span className="material-symbols-outlined text-[16px] text-[var(--color-pib-text-muted)]">link</span>
              <a href={social.facebook} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[var(--color-accent-v2)] hover:underline">
                Facebook
              </a>
            </div>
          )}
          {social?.instagram && (
            <div className="flex items-center gap-2 py-1">
              <span className="material-symbols-outlined text-[16px] text-[var(--color-pib-text-muted)]">link</span>
              <a href={social.instagram} target="_blank" rel="noopener noreferrer"
                className="text-sm text-[var(--color-accent-v2)] hover:underline">
                Instagram
              </a>
            </div>
          )}
        </SectionCard>
      )}

      {/* Parent company */}
      {company.parentCompanyId && (
        <SectionCard title="Parent Company">
          <Link
            href={`/portal/companies/${company.parentCompanyId}`}
            className="text-sm text-[var(--color-accent-v2)] hover:underline flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">domain</span>
            View parent company
          </Link>
        </SectionCard>
      )}

      {/* Custom fields */}
      {customFields.length > 0 && (
        <SectionCard title="Custom Fields">
          {customFields.map(([key, val]) => (
            <Field key={key} label={key} value={String(val)} />
          ))}
        </SectionCard>
      )}
    </div>
  )
}
