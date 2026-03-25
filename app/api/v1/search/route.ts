import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

function matches(doc: Record<string, any>, q: string): boolean {
  const lower = q.toLowerCase()
  return Object.values(doc).some((v) =>
    typeof v === 'string' && v.toLowerCase().includes(lower)
  )
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 1) return apiError('q is required', 400)

  const [contactsSnap, dealsSnap, emailsSnap] = await Promise.all([
    (adminDb.collection('contacts') as any).where('deleted', '!=', true).limit(200).get(),
    (adminDb.collection('deals') as any).where('deleted', '!=', true).limit(200).get(),
    (adminDb.collection('emails') as any).where('deleted', '!=', true).limit(200).get(),
  ])

  const contacts = contactsSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => matches(d, q))
    .slice(0, 20)

  const deals = dealsSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => matches(d, q))
    .slice(0, 20)

  const emails = emailsSnap.docs
    .map((d: any) => ({ id: d.id, ...d.data() }))
    .filter((d: any) => matches(d, q))
    .slice(0, 20)

  return apiSuccess({ contacts, deals, emails, query: q })
})
