'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { logout } from '@/lib/firebase/auth'

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
  const router = useRouter()
  const [enquiries, setEnquiries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const res = await fetch('/api/v1/portal/enquiries')
      const body = await res.json()
      setEnquiries(body.data ?? [])
      setLoading(false)
    })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  const activeCount = enquiries.filter((e) => e.status === 'active').length
  const totalCount = enquiries.length

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="font-headline text-4xl font-bold tracking-tighter">Your Projects</h1>
          <button onClick={handleLogout} className="text-white/40 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>

        {!loading && totalCount > 0 && (
          <div className="grid grid-cols-2 gap-4 mb-10">
            <div className="glass-card p-6 text-center">
              <p className="text-4xl font-headline font-bold tracking-tighter">{totalCount}</p>
              <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">Total Projects</p>
            </div>
            <div className="glass-card p-6 text-center">
              <p className="text-4xl font-headline font-bold tracking-tighter text-green-300">{activeCount}</p>
              <p className="text-white/40 text-sm mt-1 font-label uppercase tracking-widest">In Progress</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="glass-card p-8 animate-pulse h-28" />
            ))}
          </div>
        ) : enquiries.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-white/40 mb-6">No projects yet.</p>
            <a href="/start-a-project" className="text-white underline text-sm">Start a project →</a>
          </div>
        ) : (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <Link
                key={enq.id}
                href={`/portal/enquiries/${enq.id}`}
                className="glass-card p-8 flex justify-between items-start hover:bg-white/[0.05] transition-colors block"
              >
                <div>
                  <h3 className="font-headline text-xl font-bold tracking-tight mb-2">
                    {enq.projectType?.toUpperCase() ?? 'Project'}
                  </h3>
                  <p className="text-white/50 text-sm line-clamp-2">{enq.details}</p>
                </div>
                <span className={`flex-shrink-0 ml-4 text-xs font-label uppercase tracking-widest border px-3 py-1 rounded-full ${STATUS_COLORS[enq.status] ?? 'border-white/20 text-white/40'}`}>
                  {STATUS_LABELS[enq.status] ?? enq.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
