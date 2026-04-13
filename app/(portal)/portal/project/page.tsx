'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const STATUS_STEPS = [
  { key: 'new', label: 'Under Review' },
  { key: 'reviewing', label: 'In Discussion' },
  { key: 'active', label: 'In Progress' },
  { key: 'closed', label: 'Completed' },
]

function StatusTracker({ status }: { status: string }) {
  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status)
  return (
    <div className="flex items-center gap-0 w-full max-w-lg">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx
        const active = i === currentIdx
        return (
          <div key={step.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={`w-3 h-3 rounded-full border transition-colors ${
                  active
                    ? 'bg-[var(--color-accent-v2)] border-[var(--color-accent-v2)]'
                    : done
                    ? 'bg-[var(--color-on-surface-variant)]/60 border-[var(--color-on-surface-variant)]/60'
                    : 'bg-transparent border-[var(--color-outline-variant)]'
                }`}
              />
              <span className={`text-[10px] font-label uppercase tracking-widest whitespace-nowrap ${active ? 'text-[var(--color-accent-v2)]' : 'text-[var(--color-on-surface-variant)]'}`}>
                {step.label}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-4 transition-colors ${done && i < currentIdx ? 'bg-[var(--color-outline-variant)]' : 'bg-[var(--color-outline-variant)]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
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
        {[...Array(2)].map((_, i) => <div key={i} className="pib-skeleton p-8 h-40" />)}
      </div>
    )
  }

  if (enquiries.length === 0) {
    return (
      <div className="pib-card text-center">
        <p className="text-[var(--color-on-surface-variant)] mb-4">No projects yet.</p>
        <Link href="/start-a-project" className="text-[var(--color-accent-v2)] text-sm underline">Start a project →</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Your Projects</h1>
        <p className="text-sm text-[var(--color-on-surface-variant)] mt-1">Track the progress of your active projects.</p>
      </div>

      {enquiries.map((enq) => (
        <div key={enq.id} className="pib-card space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-headline text-xl font-bold tracking-tight">
                {enq.projectType?.toUpperCase() ?? 'Project'}
              </h2>
              <p className="text-[var(--color-on-surface-variant)] text-sm mt-1 max-w-xl">{enq.details}</p>
            </div>
            <Link
              href={`/portal/messages?enquiryId=${enq.id}`}
              className="text-xs font-label uppercase tracking-widest text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)] border border-[var(--color-outline-variant)] hover:border-[var(--color-on-surface-variant)] px-3 py-1.5 transition-colors"
            >
              Messages
            </Link>
          </div>

          <StatusTracker status={enq.status} />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-[var(--color-outline-variant)]">
            {enq.budget && (
              <div>
                <p className="text-[10px] font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">Budget</p>
                <p className="text-sm text-[var(--color-on-surface)] mt-0.5">{enq.budget}</p>
              </div>
            )}
            {enq.timeline && (
              <div>
                <p className="text-[10px] font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">Timeline</p>
                <p className="text-sm text-[var(--color-on-surface)] mt-0.5">{enq.timeline}</p>
              </div>
            )}
            {enq.createdAt && (
              <div>
                <p className="text-[10px] font-label uppercase tracking-widest text-[var(--color-on-surface-variant)]">Submitted</p>
                <p className="text-sm text-[var(--color-on-surface)] mt-0.5">
                  {new Date(
                    (enq.createdAt._seconds ?? enq.createdAt.seconds ?? 0) * 1000
                  ).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
