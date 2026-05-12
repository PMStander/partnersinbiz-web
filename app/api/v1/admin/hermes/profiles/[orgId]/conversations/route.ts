import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { requireHermesProfileAccess } from '@/lib/hermes/server'
import { createConversation, listConversations } from '@/lib/hermes/conversations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ orgId: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user, ctx) => {
  const { orgId } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof Response) return access
  const items = await listConversations(orgId, user.uid)
  return apiSuccess({ conversations: items })
})

export const POST = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { orgId } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof Response) return access
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title : undefined
  if (title && title.length > 200) return apiError('title too long', 400)
  const conv = await createConversation({
    orgId,
    profile: access.link.profile,
    ownerUid: user.uid,
    title,
  })
  return apiSuccess({ conversation: conv })
})
