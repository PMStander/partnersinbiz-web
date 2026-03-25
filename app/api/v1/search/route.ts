import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matches(doc: Record<string, any>, q: string): boolean {
  const lower = q.toLowerCase()
  return Object.values(doc).some((v) =>
    typeof v === 'string' && v.toLowerCase().includes(lower)
  )
}

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 1) return apiError('q is required', 400)

  // Fetch without != filter (avoids composite index), filter in memory
  const [contactsSnap, dealsSnap, emailsSnap] = await Promise.all([
    (adminDb.collection('contacts') as any).limit(200).get(),
    (adminDb.collection('deals') as any).limit(200).get(),
    (adminDb.collection('emails') as any).limit(200).get(),
  ])

  const contacts = contactsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true && matches(d, q))
    .slice(0, 20)

  const deals = dealsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true && matches(d, q))
    .slice(0, 20)

  const emails = emailsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true && matches(d, q))
    .slice(0, 20)

  return apiSuccess({ contacts, deals, emails, query: q })
})
