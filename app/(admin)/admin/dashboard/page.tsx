'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { type Enquiry } from '@/lib/firebase/firestore'

const STATUSES = ['new', 'reviewing', 'active', 'closed'] as const

export default function AdminDashboard() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDocs(collection(db, 'enquiries'))
      .then((snapshot) => {
        setEnquiries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)))
        setLoading(false)
      })
  }, [])

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/enquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setEnquiries((prev) => prev.map((e) => e.id === id ? { ...e, status: status as Enquiry['status'] } : e))
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tighter">All Enquiries</h1>
        <p className="text-on-surface-variant text-sm mt-1">Incoming project requests from the website.</p>
      </div>
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-surface-container animate-pulse" />
          ))}
        </div>
      ) : enquiries.length === 0 ? (
        <div className="border border-outline-variant p-12 text-center">
          <p className="text-on-surface-variant">No enquiries yet. Share your site to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enquiries.map((enq) => (
            <div key={enq.id} className="border border-outline-variant p-6 flex flex-col md:flex-row justify-between gap-4">
              <div className="flex-1">
                <p className="font-headline font-bold text-base mb-1">
                  {enq.name}
                  <span className="text-on-surface-variant font-normal text-sm ml-2">— {enq.email}</span>
                </p>
                <p className="text-on-surface-variant text-xs uppercase tracking-widest mb-2">
                  {enq.projectType} · {enq.company}
                </p>
                <p className="text-on-surface-variant text-sm">{enq.details.slice(0, 200)}</p>
              </div>
              <div className="flex flex-col gap-1 min-w-[140px]">
                <label className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Status</label>
                <select
                  value={enq.status}
                  onChange={(e) => updateStatus(enq.id, e.target.value)}
                  className="bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface focus:outline-none focus:border-on-surface"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-black">{s}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
