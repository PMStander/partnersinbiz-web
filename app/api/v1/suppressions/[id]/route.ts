// app/api/v1/suppressions/[id]/route.ts
//
// DELETE /api/v1/suppressions/[id]
//   Remove a suppression row. The route is org-scoped: clients can only
//   delete suppressions belonging to their own org; admins must pass orgId
//   on the querystring.

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { removeSuppressionById } from '@/lib/email/suppressions'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const DELETE = withAuth(
  'client',
  async (
    req: NextRequest,
    user: ApiUser,
    context: { params: Promise<{ id: string }> },
  ) => {
    const { id } = await context.params
    if (!id) return apiError('id is required')

    const { searchParams } = new URL(req.url)
    const scope = resolveOrgScope(user, searchParams.get('orgId'))
    if (!scope.ok) return apiError(scope.error, scope.status)

    const { removed } = await removeSuppressionById(id, scope.orgId)
    if (removed === 0) return apiError('Suppression not found', 404)
    return apiSuccess({ removed })
  },
)
