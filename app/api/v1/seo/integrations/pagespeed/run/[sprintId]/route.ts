import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess } from '@/lib/api/response'
import { pullDailyPagespeedForSprint } from '@/lib/seo/integrations/pagespeed'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  withIdempotency(async (_req: NextRequest, _user: ApiUser, ctx: { params: Promise<{ sprintId: string }> }) => {
    const { sprintId } = await ctx.params
    await pullDailyPagespeedForSprint(sprintId)
    return apiSuccess({ sprintId, pulled: true })
  }),
)
