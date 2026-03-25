// app/(admin)/admin/email/page.tsx
'use client'
export const dynamic = 'force-dynamic'
import { useEffect, useState, useCallback } from 'react'
import { EmailList, type EmailFolder } from '@/components/admin/email/EmailList'
import { EmailDetail } from '@/components/admin/email/EmailDetail'

const FOLDER_STATUS: Record<EmailFolder, string> = {
  sent: 'sent',
  scheduled: 'scheduled',
  drafts: 'draft',
  failed: 'failed',
}

interface EmailRow {
  id: string
  to: string
  subject: string
  status: string
  sentAt: unknown
  scheduledFor: unknown
  createdAt: unknown
  from: string
  cc: string[]
  bodyHtml: string
  bodyText: string
}

export default function EmailInboxPage() {
  const [folder, setFolder] = useState<EmailFolder>('sent')
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailEmail, setDetailEmail] = useState<EmailRow | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const fetchEmails = useCallback(async () => {
    setListLoading(true)
    setSelectedId(null)
    setDetailEmail(null)
    const status = FOLDER_STATUS[folder]
    const res = await fetch(`/api/v1/email?status=${status}&limit=100`)
    const body = await res.json()
    setEmails(body.data ?? [])
    setListLoading(false)
  }, [folder])

  useEffect(() => { fetchEmails() }, [fetchEmails])

  async function handleSelect(id: string) {
    setSelectedId(id)
    setDetailLoading(true)
    const found = emails.find((e) => e.id === id) ?? null
    setDetailEmail(found)
    setDetailLoading(false)
  }

  return (
    <div className="flex h-full -m-6 overflow-hidden">
      <EmailList
        folder={folder}
        emails={emails}
        loading={listLoading}
        selectedId={selectedId}
        onSelect={handleSelect}
        onFolderChange={(f) => setFolder(f)}
      />
      <EmailDetail email={detailEmail} loading={detailLoading} />
    </div>
  )
}
