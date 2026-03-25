import { NextRequest } from 'next/server'
import { generateText } from 'ai'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { BRIEF_MODEL } from '@/lib/ai/client'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params

  const contactRef = adminDb.doc(`contacts/${id}`)
  const contactSnap = await contactRef.get()
  if (!contactSnap.exists) return apiError('Contact not found', 404)
  const contact = contactSnap.data()!

  const [activitiesSnap, emailsSnap, dealsSnap] = await Promise.all([
    (adminDb.collection('activities') as any)
      .where('contactId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get(),
    (adminDb.collection('emails') as any)
      .where('contactId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get(),
    (adminDb.collection('deals') as any)
      .where('contactId', '==', id)
      .where('deleted', '!=', true)
      .get(),
  ])

  const activities = activitiesSnap.docs.map((d: any) => d.data())
  const emails = emailsSnap.docs.map((d: any) => d.data())
  const deals = dealsSnap.docs.map((d: any) => d.data())

  const context_str = [
    `Contact: ${contact.name} (${contact.email}) at ${contact.company ?? 'unknown company'}`,
    `Stage: ${contact.stage ?? 'none'}, Type: ${contact.type ?? 'none'}`,
    contact.notes ? `Notes: ${contact.notes}` : '',
    deals.length > 0
      ? `Deals: ${deals.map((d: any) => `${d.name} ($${d.value}, ${d.stage})`).join('; ')}`
      : 'No active deals.',
    activities.length > 0
      ? `Recent activity: ${activities.slice(0, 5).map((a: any) => `${a.type}: ${a.note}`).join('; ')}`
      : 'No recent activity.',
    emails.length > 0
      ? `Recent emails: ${emails.map((e: any) => `"${e.subject}" (${e.status})`).join('; ')}`
      : 'No emails sent.',
  ].filter(Boolean).join('\n')

  const { text } = await generateText({
    model: BRIEF_MODEL,
    system: 'You are a B2B sales assistant. Write a concise 3–5 sentence brief about this prospect suitable for a sales rep about to reach out. Be specific, practical, and highlight the most important context.',
    prompt: context_str,
    maxOutputTokens: 300,
  })

  return apiSuccess({ brief: text, contactId: id })
})
