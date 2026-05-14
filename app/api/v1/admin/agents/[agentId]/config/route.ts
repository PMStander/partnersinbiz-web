/**
 * GET /api/v1/admin/agents/[agentId]/config
 *
 * Returns the agent's Firestore config (model, persona, baseUrl, enabled, VPS port)
 * plus a best-effort probe of the Hermes gateway's /v1/models endpoint.
 * Individual Hermes gateways do not expose /api/config — that path belongs to the
 * dashboard layer which uses a separate session token. We return Firestore data instead.
 */
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { getAgent, callAgentPath } from '@/lib/agents/team'
import { AGENT_IDS, type AgentId } from '@/lib/agents/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ agentId: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user, ctx) => {
  const { agentId } = await (ctx as Ctx).params
  if (!AGENT_IDS.includes(agentId as AgentId)) return apiError('Invalid agentId', 400)

  const agent = await getAgent(agentId as AgentId)
  if (!agent) return apiError(`agent_team/${agentId} not found`, 404)

  // Best-effort: probe the Hermes gateway /v1/models to get live model info.
  let models: unknown = null
  try {
    const { response, data } = await callAgentPath(agentId as AgentId, '/v1/models')
    if (response.ok) models = data
  } catch { /* not all gateways expose /v1/models — ignore */ }

  return apiSuccess({
    agentId: agent.agentId,
    name: agent.name,
    role: agent.role,
    enabled: agent.enabled,
    defaultModel: agent.defaultModel,
    baseUrl: agent.baseUrl,
    lastHealthStatus: agent.lastHealthStatus ?? null,
    lastHealthCheck: agent.lastHealthCheck ?? null,
    persona: agent.persona,
    models,
  })
})
