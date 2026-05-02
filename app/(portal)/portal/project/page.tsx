'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const STATUS_STEPS = [
  { key: 'new',       label: 'Under Review' },
  { key: 'reviewing', label: 'In Discussion' },
  { key: 'active',    label: 'In Progress' },
  { key: 'closed',    label: 'Completed' },
]

function StatusTracker({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status)
  const safeIdx = currentIdx === -1 ? 0 : currentIdx
  return (
    <div className="grid grid-cols-4 gap-0 w-full">
      {STATUS_STEPS.map((step, i) => {
        const done = i < safeIdx
        const active = i === safeIdx
        return (
          <div key={step.key} className="flex items-center gap-3 last:pr-0">
            <div className="flex flex-col items-start gap-2 flex-1 min-w-0">
              <div className="flex items-center gap-2 w-full">
                <div
                  className={[
                    'w-3 h-3 rounded-full border shrink-0 transition-colors',
                    active
                      ? 'bg-[var(--color-pib-accent)] border-[var(--color-pib-accent)] shadow-[0_0_0_4px_rgba(245,166,35,0.18)]'
                      : done
                      ? 'bg-[var(--color-pib-success)] border-[var(--color-pib-success)]'
                      : 'bg-transparent border-[var(--color-pib-line-strong)]',
                  ].join(' ')}
                />
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className={[
                      'h-px flex-1 transition-colors',
                      done ? 'bg-[var(--color-pib-success)]' : 'bg-[var(--color-pib-line)]',
                    ].join(' ')}
                  />
                )}
              </div>
              <span
                className={[
                  'text-[10px] font-mono uppercase tracking-widest leading-tight',
                  active
                    ? 'text-[var(--color-pib-accent)]'
                    : done
                    ? 'text-[var(--color-pib-text)]'
                    : 'text-[var(--color-pib-text-muted)]',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function fmtDate(ts: any) {
  const secs = ts?._seconds ?? ts?.seconds
  if (!secs) return '—'
  return new Date(secs * 1000).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PortalProjectPage() {
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/portal/enquiries')
      .then((r) => r.json())
      .then((b) => { setEnquiries(b.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => <div key={i} className="pib-skeleton h-48" />)}
      </div>
    )
  }

  if (enquiries.length === 0) {
    return (
      <div className="space-y-10">
        <header>
          <p className="eyebrow">Your projects</p>
          <h1 className="pib-page-title mt-2">Projects</h1>
        </header>
        <div className="bento-card p-10 text-center">
          <span className="material-symbols-outlined text-4xl text-[var(--color-pib-accent)]">rocket_launch</span>
          <h2 className="font-display text-2xl mt-4">No projects yet.</h2>
          <p className="text-sm text-[var(--color-pib-text-muted)] mt-2">Ready to start something new?</p>
          <Link href="/start-a-project" className="btn-pib-accent mt-6">
            Start a project
            <span className="material-symbols-outlined text-base">arrow_outward</span>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      <header>
        <p className="eyebrow">Your projects</p>
        <h1 className="pib-page-title mt-2">Projects</h1>
        <p className="pib-page-sub max-w-2xl">Track every brief from kick-off to launch.</p>
      </header>

      <div className="space-y-6">
        {enquiries.map((enq) => (
          <article key={enq.id} className="bento-card !p-0 overflow-hidden">
            <div className="p-7 space-y-6">
              <div className="flex justify-between items-start gap-4 flex-wrap">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="pill pill-accent">{(enq.projectType ?? 'project').toLowerCase()}</span>
                  </div>
                  <h2 className="font-display text-2xl md:text-3xl text-balance leading-tight">
                    {enq.projectType?.replace(/_/g, ' ') ?? 'Project'}
                  </h2>
                  <p className="text-[var(--color-pib-text-muted)] text-sm max-w-2xl text-pretty">
                    {enq.details}
                  </p>
                </div>
                <Link
                  href={`/portal/messages?enquiryId=${enq.id}`}
                  className="btn-pib-secondary !py-2 !px-4 !text-sm shrink-0"
                >
                  <span className="material-symbols-outlined text-base">forum</span>
                  Open thread
                </Link>
              </div>

              <StatusTracker status={enq.status} />
            </div>

            <div className="border-t border-[var(--color-pib-line)] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[var(--color-pib-line)]">
              <div className="p-5">
                <p className="eyebrow !text-[10px]">Budget</p>
                <p className="font-display text-lg mt-1">{enq.budget || '—'}</p>
              </div>
              <div className="p-5">
                <p className="eyebrow !text-[10px]">Timeline</p>
                <p className="font-display text-lg mt-1">{enq.timeline || '—'}</p>
              </div>
              <div className="p-5">
                <p className="eyebrow !text-[10px]">Submitted</p>
                <p className="font-display text-lg mt-1">{fmtDate(enq.createdAt)}</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
