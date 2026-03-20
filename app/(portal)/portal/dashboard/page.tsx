'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { getClientEnquiries, type Enquiry } from '@/lib/firebase/firestore'
import { logout } from '@/lib/firebase/auth'

const STATUS_LABELS: Record<string, string> = {
  new: 'Under Review',
  reviewing: 'In Discussion',
  active: 'In Progress',
  closed: 'Completed',
}

export default function PortalDashboard() {
  const router = useRouter()
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const data = await getClientEnquiries(user.uid)
      setEnquiries(data)
      setLoading(false)
    })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <h1 className="font-headline text-4xl font-bold tracking-tighter">Your Projects</h1>
          <button onClick={handleLogout} className="text-white/40 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
        {loading ? (
          <p className="text-white/40">Loading...</p>
        ) : enquiries.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-white/40 mb-6">No enquiries yet.</p>
            <a href="/start-a-project" className="text-white underline text-sm">Start a project</a>
          </div>
        ) : (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <div key={enq.id} className="glass-card p-8">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-headline text-xl font-bold tracking-tight mb-2">{enq.projectType.toUpperCase()}</h3>
                    <p className="text-white/50 text-sm mb-4">{enq.details.slice(0, 120)}...</p>
                  </div>
                  <span className="text-xs font-label uppercase tracking-widest text-white/40 border border-white/20 px-3 py-1 rounded-full">
                    {STATUS_LABELS[enq.status] ?? enq.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
