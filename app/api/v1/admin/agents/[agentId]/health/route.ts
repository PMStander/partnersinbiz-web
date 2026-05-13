/**
 * GET /api/v1/admin/agents/[agentId]/health
 *
 * Pings the agent's /v1/health endpoint, writes the result back to
 * agent_team/{agentId} (lastHealthCheck + lastHealthStatus), and returns
 * the result immediately.
 *
 * Auth: admin.
 */

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { pingAgentHealth } from '@/lib/agents/team'
import { AGENT_IDS, type AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, _user, context?: { params?: { agentId?: string } }) => {
    const agentId = context?.params?.agentId as string | undefined
    if (!agentId || !AGENT_IDS.includes(agentId as AgentId)) {
      return apiError(`Invalid agentId; expected one of ${AGENT_IDS.join(' | ')}`, 400)
    }

    const result = await pingAgentHealth(agentId as AgentId)
    return apiSuccess({ agentId, ...result })
  },
)
