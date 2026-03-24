/**
 * GET /api/v1/email — list emails
 *
 * Query params:
 *   direction  — "outbound" | "inbound"
 *   status     — "draft" | "scheduled" | "sent" | "failed" | "opened" | "clicked"
 *   contactId  — filter by linked contact
 *   limit      — default 50, max 200
 *   page       — default 1
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import type { Email, EmailDirection, EmailStatus } from '@/lib/email/types'

const VALID_DIRECTIONS: EmailDirection[] = ['outbound', 'inbound']
const VALID_STATUSES: EmailStatus[] = ['draft', 'scheduled', 'sent', 'failed', 'opened', 'clicked']

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const direction = searchParams.get('direction') as EmailDirection | null
  const status = searchParams.get('status') as EmailStatus | null
  const contactId = searchParams.get('contactId') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('emails').where('deleted', '!=', true)

  if (direction && VALID_DIRECTIONS.includes(direction)) {
    query = query.where('direction', '==', direction)
  }
  if (status && VALID_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }
  if (contactId) {
    query = query.where('contactId', '==', contactId)
  }

  const snapshot = await query
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const emails: Email[] = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  return apiSuccess(emails, 200, { total: emails.length, page, limit })
})
