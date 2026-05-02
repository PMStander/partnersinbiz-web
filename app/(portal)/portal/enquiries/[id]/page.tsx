'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import MessageThread from '@/components/portal/MessageThread'

const STATUS_LABELS: Record<string, string> = {
  new: 'Under Review',
  reviewing: 'In Discussion',
  active: 'In Progress',
  closed: 'Completed',
}

const STATUS_PILL: Record<string, string> = {
  new: 'pib-pill',
  reviewing: 'pib-pill pib-pill-info',
  active: 'pib-pill pib-pill-success',
  closed: 'pib-pill',
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

  if (loading)
    return (
      <div className="space-y-6">
        <div className="pib-skeleton h-8 w-48" />
        <div className="pib-skeleton h-40" />
        <div className="pib-skeleton h-64" />
      </div>
    )

  if (!enquiry) return null

  return (
    <div className="space-y-8 max-w-3xl">
      <Link
        href="/portal/project"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-pib-text-muted)] hover:text-[var(--color-pib-text)] transition-colors"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to projects
      </Link>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">Project brief</p>
          <h1 className="pib-page-title mt-2">{enquiry.projectType?.replace(/_/g, ' ') ?? 'Project'}</h1>
        </div>
        <span className={STATUS_PILL[enquiry.status] ?? 'pib-pill'}>
          {STATUS_LABELS[enquiry.status] ?? enquiry.status}
        </span>
      </header>

      <section className="bento-card !p-7 space-y-3">
        <p className="eyebrow">Brief</p>
        <p className="text-[var(--color-pib-text)] leading-relaxed text-pretty">{enquiry.details}</p>
        {enquiry.company && (
          <p className="text-xs text-[var(--color-pib-text-muted)] font-mono pt-3 border-t border-[var(--color-pib-line)]">
            Company · {enquiry.company}
          </p>
        )}
      </section>

      <section className="bento-card !p-7 space-y-4">
        <p className="eyebrow">Conversation</p>
        <MessageThread
          messages={messages}
          enquiryId={enquiry.id}
          onSent={(msg) => setMessages((prev) => [...prev, msg])}
        />
      </section>
    </div>
  )
}
