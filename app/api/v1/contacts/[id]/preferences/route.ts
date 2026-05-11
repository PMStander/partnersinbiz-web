// app/api/v1/contacts/[id]/preferences/route.ts
//
// GET / PUT a contact's email preferences (topics + frequency). Admin-side
// only — the public preferences page lives at `app/preferences/[token]` and
// is signed-token authenticated.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getContactPreferences, setContactPreferences } from '@/lib/preferences/store'
import type { ApiUser } from '@/lib/api/types'
import type { FrequencyChoice } from '@/lib/preferences/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

async function loadContactOrgId(contactId: string): Promise<string | null> {
  const snap = await adminDb.collection('contacts').doc(contactId).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  return typeof data.orgId === 'string' ? data.orgId : null
}

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as Params).params
    const orgId = await loadContactOrgId(id)
    if (!orgId) return apiError('contact not found', 404)
    const scope = resolveOrgScope(user, orgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const prefs = await getContactPreferences(id, scope.orgId)
    return apiSuccess(prefs)
  },
)

export const PUT = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as Params).params
    const orgId = await loadContactOrgId(id)
    if (!orgId) return apiError('contact not found', 404)
    const scope = resolveOrgScope(user, orgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('invalid JSON body', 400)
    const next = await setContactPreferences({
      contactId: id,
      orgId: scope.orgId,
      topics:
        typeof body.topics === 'object' && body.topics !== null
          ? (body.topics as Record<string, boolean>)
          : undefined,
      frequency:
        typeof body.frequency === 'string' ? (body.frequency as FrequencyChoice) : undefined,
      unsubscribeAll: typeof body.unsubscribeAll === 'boolean' ? body.unsubscribeAll : undefined,
      updatedFrom: 'admin',
    })
    return apiSuccess(next)
  },
)
