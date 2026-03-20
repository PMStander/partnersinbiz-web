'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { type Enquiry } from '@/lib/firebase/firestore'
import { logout } from '@/lib/firebase/auth'

const STATUSES = ['new', 'reviewing', 'active', 'closed'] as const

export default function AdminDashboard() {
  const router = useRouter()
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const snapshot = await getDocs(collection(db, 'enquiries'))
      setEnquiries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)))
      setLoading(false)
    })
  }, [router])

  async function updateStatus(id: string, status: string) {
    // All Firestore writes go through the API route (Admin SDK) — never the client SDK
    await fetch(`/api/enquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setEnquiries((prev) => prev.map((e) => e.id === id ? { ...e, status: status as Enquiry['status'] } : e))
  }

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <h1 className="font-headline text-4xl font-bold tracking-tighter">Admin — All Enquiries</h1>
          <button onClick={handleLogout} className="text-white/40 hover:text-white text-sm transition-colors">Sign out</button>
        </div>
        {loading ? (
          <p className="text-white/40">Loading...</p>
        ) : (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <div key={enq.id} className="glass-card p-8">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-headline font-bold text-lg mb-1">{enq.name} <span className="text-white/40 font-normal text-sm">— {enq.email}</span></p>
                    <p className="text-white/50 text-xs uppercase tracking-widest mb-3">{enq.projectType} · {enq.company}</p>
                    <p className="text-white/60 text-sm">{enq.details.slice(0, 200)}</p>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[160px]">
                    <label className="font-headline text-[0.65rem] uppercase tracking-widest text-white/40">Status</label>
                    <select
                      value={enq.status}
                      onChange={(e) => updateStatus(enq.id, e.target.value)}
                      className="bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-neutral-900">{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
