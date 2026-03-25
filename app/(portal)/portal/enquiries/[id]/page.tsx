'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import MessageThread from '@/components/portal/MessageThread'

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

interface Message {
  id: string
  text: string
  direction: 'inbound' | 'outbound'
  authorName: string
  createdAt: any
}

export default function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [id, setId] = useState<string | null>(null)
  const [enquiry, setEnquiry] = useState<any | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then((p) => setId(p.id))
  }, [params])

  useEffect(() => {
    if (!id) return
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const [enqRes, msgRes] = await Promise.all([
        fetch(`/api/v1/portal/enquiries/${id}`),
        fetch(`/api/v1/portal/messages?enquiryId=${id}`),
      ])
      if (!enqRes.ok) { router.push('/portal/dashboard'); return }
      const enqBody = await enqRes.json()
      const msgBody = await msgRes.json()
      setEnquiry(enqBody.data)
      setMessages(msgBody.data ?? [])
      setLoading(false)
    })
  }, [id, router])

  if (loading) return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-3xl mx-auto animate-pulse space-y-4">
        <div className="h-8 w-48 bg-white/10 rounded-xl" />
        <div className="h-40 bg-white/5 rounded-2xl" />
      </div>
    </main>
  )

  if (!enquiry) return null

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <button
            onClick={() => router.push('/portal/dashboard')}
            className="text-white/40 hover:text-white text-sm transition-colors mb-6 block"
          >
            ← Back to projects
          </button>
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-headline text-3xl font-bold tracking-tighter">
              {enquiry.projectType?.toUpperCase() ?? 'Project'}
            </h1>
            <span className={`text-xs font-label uppercase tracking-widest border px-3 py-1 rounded-full ${STATUS_COLORS[enquiry.status] ?? 'border-white/20 text-white/40'}`}>
              {STATUS_LABELS[enquiry.status] ?? enquiry.status}
            </span>
          </div>
        </div>

        <div className="glass-card p-6 space-y-3">
          <h2 className="text-sm font-label uppercase tracking-widest text-white/40">Project Brief</h2>
          <p className="text-white/80 text-sm leading-relaxed">{enquiry.details}</p>
          {enquiry.company && (
            <p className="text-xs text-white/40">Company: {enquiry.company}</p>
          )}
        </div>

        <div className="glass-card p-6 space-y-4">
          <h2 className="text-sm font-label uppercase tracking-widest text-white/40">Messages</h2>
          <MessageThread
            messages={messages}
            enquiryId={enquiry.id}
            onSent={(msg) => setMessages((prev) => [...prev, msg])}
          />
        </div>
      </div>
    </main>
  )
}
