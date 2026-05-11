// app/api/v1/email-images/route.ts
//
// GET ?orgId=…&limit=N&cursor=ISO
//
// Lists images uploaded for an org, newest first. Soft-deleted records
// are excluded.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { Timestamp } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const limitRaw = Number(searchParams.get('limit') ?? '50')
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
  const cursorIso = searchParams.get('cursor')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = adminDb
    .collection('email_images')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')
    .limit(limit)

  if (cursorIso) {
    const ts = Timestamp.fromDate(new Date(cursorIso))
    q = q.startAfter(ts)
  }

  const snap = await q.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((x: any) => x.deleted !== true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((x: any) => ({
      ...x,
      createdAt: x.createdAt?.toDate?.()?.toISOString?.() ?? null,
    }))

  return apiSuccess(items, 200, { total: items.length, page: 1, limit })
})
