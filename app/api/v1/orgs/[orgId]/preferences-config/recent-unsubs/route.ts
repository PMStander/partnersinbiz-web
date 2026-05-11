// app/api/v1/orgs/[orgId]/preferences-config/recent-unsubs/route.ts
//
// Last 50 contacts in this org who recently set frequency='none' or
// triggered `unsubscribeAllAt` via the preferences page or the unsubscribe
// flow. Powers Section 3 of the admin email-preferences page.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ orgId: string }> }

interface UnsubRow {
  contactId: string
  orgId: string
  email?: string
  frequency: string
  unsubscribeAllAt: unknown
  updatedAt: unknown
  updatedFrom: string
}

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { orgId: orgIdParam } = await (context as Params).params
    const scope = resolveOrgScope(user, orgIdParam)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const orgId = scope.orgId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const snap = await (adminDb.collection('contact_preferences') as any)
      .where('orgId', '==', orgId)
      .get()

    const rows: UnsubRow[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of snap.docs as any[]) {
      const data = d.data() ?? {}
      // Only include opt-outs / restrictive states.
      const freq = typeof data.frequency === 'string' ? data.frequency : 'all'
      const isOptOut =
        !!data.unsubscribeAllAt || freq === 'none' || freq === 'transactional-only'
      if (!isOptOut) continue
      rows.push({
        contactId: d.id,
        orgId,
        frequency: freq,
        unsubscribeAllAt: data.unsubscribeAllAt ?? null,
        updatedAt: data.updatedAt ?? null,
        updatedFrom: typeof data.updatedFrom === 'string' ? data.updatedFrom : 'admin',
      })
    }

    rows.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const am = (a.updatedAt as any)?.toMillis?.() ?? 0
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bm = (b.updatedAt as any)?.toMillis?.() ?? 0
      return bm - am
    })

    const top = rows.slice(0, 50)

    // Best-effort email lookup — small N so a per-row fetch is fine.
    await Promise.all(
      top.map(async (r) => {
        try {
          const cSnap = await adminDb.collection('contacts').doc(r.contactId).get()
          if (cSnap.exists) {
            const cd = cSnap.data() ?? {}
            if (typeof cd.email === 'string') r.email = cd.email
          }
        } catch {
          // ignore
        }
      }),
    )

    return apiSuccess(top)
  },
)
