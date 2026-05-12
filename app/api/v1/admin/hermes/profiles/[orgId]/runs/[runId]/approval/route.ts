import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { requireHermesProfileAccess, resolveHermesApproval } from '@/lib/hermes/server'
import { apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

const ALLOWED_CHOICES = ['once', 'session', 'always', 'deny'] as const
type ApprovalChoice = (typeof ALLOWED_CHOICES)[number]

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ orgId: string; runId: string }> }

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { orgId, runId } = await ctx.params
  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof NextResponse) return access
  const { link } = access

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return apiError('Invalid JSON', 400)
  }

  const choice = String(body.choice ?? '').trim().toLowerCase()
  if (!ALLOWED_CHOICES.includes(choice as ApprovalChoice)) {
    return apiError('Invalid approval choice; expected one of: once, session, always, deny', 400)
  }

  const { response, data } = await resolveHermesApproval(link, runId, choice as ApprovalChoice)
  if (!response.ok) {
    return apiError(
      data && typeof data === 'object' && 'error' in data ? String((data as Record<string, unknown>).error) : 'Hermes approval failed',
      response.status,
    )
  }
  return NextResponse.json(data)
})
