/**
 * GET /api/v1/admin/agents/[agentId]/env
 *
 * Returns the agent's environment variable manifest from Hermes /api/env.
 * Values are always redacted by Hermes; this never exposes plaintext secrets.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { callAgentPath } from '@/lib/agents/team'
import { AGENT_IDS, type AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ agentId: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const { agentId } = await (ctx as Ctx).params
  if (!AGENT_IDS.includes(agentId as AgentId)) return apiError('Invalid agentId', 400)
  try {
    const { response, data } = await callAgentPath(agentId as AgentId, '/api/env')
    // 404 means the gateway doesn't expose env — return empty rather than error
    if (response.status === 404) return apiSuccess({ env: {}, supported: false })
    if (!response.ok) return apiError('Failed to fetch env from agent', 502, { upstream: data })
    return apiSuccess({ env: data, supported: true })
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to reach agent', 502)
  }
})
