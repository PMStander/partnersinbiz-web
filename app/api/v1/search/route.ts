import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

interface SearchResult {
  id: string
  type: 'contact' | 'project' | 'task' | 'invoice'
  title: string
  subtitle?: string
  url: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesQuery(text: string | undefined, q: string): boolean {
  if (!text) return false
  return text.toLowerCase().includes(q.toLowerCase())
}

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '5'), 20)

  if (!q || q.length < 2) {
    return apiError('q must be at least 2 characters', 400)
  }

  // Fetch all collections in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contactsSnap, projectsSnap, tasksSnap, invoicesSnap] = await Promise.all([
    (adminDb.collection('contacts') as any).limit(200).get(),
    (adminDb.collection('projects') as any).limit(200).get(),
    (adminDb.collectionGroup('tasks') as any).limit(200).get(),
    (adminDb.collection('invoices') as any).limit(200).get(),
  ])

  // Search contacts: match on name, email, company
  const contacts = contactsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) =>
      matchesQuery(d.name, q) ||
      matchesQuery(d.email, q) ||
      matchesQuery(d.company, q)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .slice(0, limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any): SearchResult => ({
      id: d.id,
      type: 'contact',
      title: d.name,
      subtitle: d.company || d.email,
      url: `/admin/crm/contacts/${d.id}`,
    }))

  // Search projects: match on name, description
  const projects = projectsSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) =>
      matchesQuery(d.name, q) ||
      matchesQuery(d.description, q)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .slice(0, limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any): SearchResult => {
      // TODO: Look up org slug by orgId for better URLs
      return {
        id: d.id,
        type: 'project',
        title: d.name,
        subtitle: d.description,
        url: `/admin/projects/${d.id}`,
      }
    })

  // Search tasks: match on title, description
  const tasks = tasksSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => {
      const data = d.data()
      // collectionGroup returns DocumentReference, extract parent project ID
      const parentPath = d.ref.parent.parent?.id || ''
      return { id: d.id, projectId: parentPath, ...data }
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) =>
      matchesQuery(d.title, q) ||
      matchesQuery(d.description, q)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .slice(0, limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any): SearchResult => {
      // TODO: Resolve org slug via projectId for better URLs
      return {
        id: d.id,
        type: 'task',
        title: d.title,
        subtitle: d.status,
        url: `/admin/projects/${d.projectId}?task=${d.id}`,
      }
    })

  // Search invoices: match on invoiceNumber, notes
  const invoices = invoicesSnap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) => d.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((d: any) =>
      matchesQuery(d.invoiceNumber, q) ||
      matchesQuery(d.notes, q)
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .slice(0, limit)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any): SearchResult => ({
      id: d.id,
      type: 'invoice',
      title: d.invoiceNumber,
      subtitle: `${d.currency} ${d.total?.toLocaleString() ?? '0'}`,
      url: `/admin/invoicing/${d.id}`,
    }))

  // Combine all results
  const results = [...contacts, ...projects, ...tasks, ...invoices].slice(0, limit * 4)

  return apiSuccess({
    results,
    query: q,
    total: results.length,
  })
})
