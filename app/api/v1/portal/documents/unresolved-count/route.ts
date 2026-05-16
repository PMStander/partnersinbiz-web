import { NextRequest } from 'next/server'

import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiError, apiSuccess } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { CLIENT_DOCUMENTS_COLLECTION } from '@/lib/client-documents/store'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

// Index-free implementation: list this org's client_documents, then run a
// count() aggregation on each doc's comments subcollection where status=open.
// Each count() aggregation is billed as 1 read regardless of comment volume.
export const GET = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)

  const docsSnap = await adminDb
    .collection(CLIENT_DOCUMENTS_COLLECTION)
    .where('orgId', '==', scope.orgId)
    .get()

  const liveDocs = docsSnap.docs.filter((doc) => (doc.data() as { deleted?: boolean }).deleted !== true)
  if (liveDocs.length === 0) return apiSuccess({ count: 0 })

  const counts = await Promise.all(
    liveDocs.map(async (doc) => {
      const agg = await doc.ref.collection('comments').where('status', '==', 'open').count().get()
      return agg.data().count
    }),
  )

  const total = counts.reduce((sum, n) => sum + n, 0)
  return apiSuccess({ count: total })
})
