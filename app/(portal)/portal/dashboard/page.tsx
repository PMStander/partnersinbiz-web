'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  new: 'Under Review',
  reviewing: 'In Discussion',
  active: 'In Progress',
  closed: 'Completed',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'border-white/20 text-white/50',
  reviewing: 'border-blue-400/40 text-blue-300',
  active: 'border-green-400/40 text-green-300',
  closed: 'border-white/10 text-white/30',
}

export default function PortalDashboard() {
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/portal/enquiries')
      .then((r) => r.json())
      .then((b) => { setEnquiries(b.data ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const activeCount = enquiries.filter((e) => e.status === 'active').length
  const totalCount = enquiries.length

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-2xl font-bold tracking-tighter">Dashboard</h1>
        <p className="text-sm text-white/40 mt-1">Overview of your projects with Partners in Biz.</p>
      </div>

      {!loading && totalCount > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-white/10 p-6 text-center">
            <p className="text-4xl font-headline font-bold tracking-tighter">{totalCount}</p>
            <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Total Projects</p>
          </div>
          <div className="border border-white/10 p-6 text-center">
            <p className="text-4xl font-headline font-bold tracking-tighter text-green-300">{activeCount}</p>
            <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">In Progress</p>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-label uppercase tracking-widest text-white/30 mb-3">Recent Projects</h2>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="border border-white/10 p-6 animate-pulse h-20" />
            ))}
          </div>
        ) : enquiries.length === 0 ? (
          <div className="border border-white/10 p-12 text-center">
            <p className="text-white/40 mb-4">No projects yet.</p>
            <Link href="/start-a-project" className="text-white underline text-sm">Start a project →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {enquiries.map((enq) => (
              <Link
                key={enq.id}
                href={`/portal/project`}
                className="border border-white/10 p-5 flex justify-between items-center hover:bg-white/5 transition-colors block"
              >
                <div>
                  <p className="font-headline font-bold tracking-tight">
                    {enq.projectType?.toUpperCase() ?? 'Project'}
                  </p>
                  <p className="text-white/40 text-xs mt-0.5 line-clamp-1">{enq.details}</p>
                </div>
                <span className={`flex-shrink-0 ml-4 text-xs font-label uppercase tracking-widest border px-3 py-1 ${STATUS_COLORS[enq.status] ?? 'border-white/20 text-white/40'}`}>
                  {STATUS_LABELS[enq.status] ?? enq.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
