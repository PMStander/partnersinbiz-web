// app/(admin)/admin/crm/contacts/[id]/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ContactForm } from '@/components/admin/crm/ContactForm'
import { ActivityTimeline } from '@/components/admin/crm/ActivityTimeline'

const STAGES = ['new','contacted','replied','demo','proposal','won','lost']

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [contact, setContact] = useState<Record<string, unknown> | null>(null)
  const [activities, setActivities] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/crm/contacts/${id}`)
      .then((r) => r.json())
      .then((b) => { setContact(b.data); setLoading(false) })
  }, [id])

  useEffect(() => {
    fetch(`/api/v1/crm/contacts/${id}/activities`)
      .then((r) => r.json())
      .then((b) => { setActivities(b.data ?? []); setActivitiesLoading(false) })
  }, [id])

  async function saveContact(data: Record<string, unknown>) {
    await fetch(`/api/v1/crm/contacts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    })
    setContact((prev) => ({ ...prev, ...data }))
    setEditing(false)
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    await fetch('/api/v1/crm/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contactId: id, type: 'note', summary: noteText.trim(), dealId: '', metadata: {} }),
    })
    setNoteText('')
    const res = await fetch(`/api/v1/crm/contacts/${id}/activities`)
    const body = await res.json()
    setActivities(body.data ?? [])
    setSavingNote(false)
  }

  async function changeStage(stage: string) {
    await fetch(`/api/v1/crm/contacts/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
    await fetch('/api/v1/crm/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contactId: id, type: 'stage_change',
        summary: `Stage changed to ${stage}`,
        dealId: '', metadata: { newStage: stage },
      }),
    })
    setContact((prev) => ({ ...prev, stage }))
    const res = await fetch(`/api/v1/crm/contacts/${id}/activities`)
    setActivities((await res.json()).data ?? [])
  }

  if (loading) {
    return <div className="h-32 bg-surface-container animate-pulse" />
  }

  if (!contact) {
    return (
      <div className="text-center py-16">
        <p className="text-on-surface-variant mb-4">Contact not found.</p>
        <Link href="/admin/crm/contacts" className="text-sm underline text-on-surface">← Back to contacts</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/crm/contacts" className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant hover:text-on-surface">
          ← Contacts
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact info */}
        <div className="lg:col-span-1">
          <div className="border border-outline-variant">
            <div className="px-5 py-4 border-b border-outline-variant flex justify-between items-center">
              <h1 className="font-headline text-xl font-bold tracking-tight">
                {String(contact.name ?? '')}
              </h1>
              <button
                onClick={() => setEditing(!editing)}
                className="text-[11px] font-label text-on-surface-variant hover:text-on-surface"
              >
                {editing ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editing ? (
              <ContactForm
                onSave={saveContact}
                onCancel={() => setEditing(false)}
                initial={contact}
              />
            ) : (
              <div className="p-5 space-y-3 text-sm">
                {[
                  ['Email', contact.email],
                  ['Phone', contact.phone],
                  ['Company', contact.company],
                  ['Website', contact.website],
                  ['Source', contact.source],
                  ['Type', contact.type],
                ].map(([label, val]) => val ? (
                  <div key={String(label)}>
                    <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{String(label)}</p>
                    <p className="text-on-surface mt-0.5">{String(val)}</p>
                  </div>
                ) : null)}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="border border-outline-variant mt-4 p-4 space-y-3">
            <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Change Stage</p>
            <div className="flex flex-wrap gap-2">
              {STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => changeStage(s)}
                  className={`text-[10px] font-label uppercase tracking-widest px-2 py-1 border transition-colors ${
                    contact.stage === s
                      ? 'border-on-surface text-on-surface'
                      : 'border-outline-variant text-on-surface-variant hover:border-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Activity timeline */}
        <div className="lg:col-span-2">
          <div className="border border-outline-variant">
            <div className="px-5 py-4 border-b border-outline-variant">
              <h2 className="font-headline text-base font-bold tracking-tight">Activity</h2>
            </div>
            {/* Add note */}
            <div className="px-5 py-4 border-b border-outline-variant flex gap-3">
              <input
                placeholder="Add a note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addNote()}
                className="flex-1 bg-transparent border border-outline-variant px-3 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-on-surface"
              />
              <button
                onClick={addNote}
                disabled={savingNote || !noteText.trim()}
                className="px-4 py-1.5 text-sm font-label text-black bg-on-surface hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {savingNote ? '…' : 'Add'}
              </button>
            </div>
            <div className="px-5 py-4">
              <ActivityTimeline activities={activities as never} loading={activitiesLoading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
