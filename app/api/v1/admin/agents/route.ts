/**
 * GET /api/v1/admin/agents
 *
 * Returns all 5 agent team docs. The apiKey field is always masked
 * (last 6 chars visible, rest replaced with ●). Auth: admin.
 */

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import { listAgents } from '@/lib/agents/team'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (_req: NextRequest) => {
  const agents = await listAgents()
  return apiSuccess({ agents })
})
