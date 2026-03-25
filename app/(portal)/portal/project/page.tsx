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
                    ? 'bg-white border-white'
                    : done
                    ? 'bg-white/60 border-white/60'
                    : 'bg-transparent border-white/20'
                }`}
              />
              <span className={`text-[10px] font-label uppercase tracking-widest whitespace-nowrap ${active ? 'text-white' : 'text-white/30'}`}>
                {step.label}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 mb-4 transition-colors ${done && i < currentIdx ? 'bg-white/40' : 'bg-white/10'}`} />
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
        {[...Array(2)].map((_, i) => <div key={i} className="border border-white/10 p-8 animate-pulse h-40" />)}
      </div>
    )
  }

  if (enquiries.length === 0) {
    return (
      <div className="border border-white/10 p-12 text-center">
        <p className="text-white/40 mb-4">No projects yet.</p>
        <Link href="/start-a-project" className="text-white text-sm underline">Start a project →</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Your Projects</h1>
        <p className="text-sm text-white/40 mt-1">Track the progress of your active projects.</p>
      </div>

      {enquiries.map((enq) => (
        <div key={enq.id} className="border border-white/10 p-6 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-headline text-xl font-bold tracking-tight">
                {enq.projectType?.toUpperCase() ?? 'Project'}
              </h2>
              <p className="text-white/50 text-sm mt-1 max-w-xl">{enq.details}</p>
            </div>
            <Link
              href={`/portal/messages?enquiryId=${enq.id}`}
              className="text-xs font-label uppercase tracking-widest text-white/40 hover:text-white border border-white/20 hover:border-white/40 px-3 py-1.5 transition-colors"
            >
              Messages
            </Link>
          </div>

          <StatusTracker status={enq.status} />

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2 border-t border-white/10">
            {enq.budget && (
              <div>
                <p className="text-[10px] font-label uppercase tracking-widest text-white/30">Budget</p>
                <p className="text-sm text-white mt-0.5">{enq.budget}</p>
              </div>
            )}
            {enq.timeline && (
              <div>
                <p className="text-[10px] font-label uppercase tracking-widest text-white/30">Timeline</p>
                <p className="text-sm text-white mt-0.5">{enq.timeline}</p>
              </div>
            )}
            {enq.createdAt && (
              <div>
                <p className="text-[10px] font-label uppercase tracking-widest text-white/30">Submitted</p>
                <p className="text-sm text-white mt-0.5">
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
