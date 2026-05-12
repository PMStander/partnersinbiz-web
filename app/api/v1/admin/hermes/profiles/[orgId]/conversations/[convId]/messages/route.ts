import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiError, apiSuccess } from '@/lib/api/response'
import { createHermesRun, requireHermesProfileAccess } from '@/lib/hermes/server'
import { appendMessage, getConversation, listMessages, touchConversation } from '@/lib/hermes/conversations'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ orgId: string; convId: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user, ctx) => {
  const { orgId, convId } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof Response) return access
  const conv = await getConversation(convId)
  if (!conv || conv.orgId !== orgId) return apiError('Conversation not found', 404)
  if (!conv.participantUids.includes(user.uid)) return apiError('Forbidden', 403)
  const messages = await listMessages(convId)
  return apiSuccess({ messages })
})

export const POST = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { orgId, convId } = await (ctx as Ctx).params
  const access = await requireHermesProfileAccess(user, orgId, 'runs')
  if (access instanceof Response) return access
  const conv = await getConversation(convId)
  if (!conv || conv.orgId !== orgId) return apiError('Conversation not found', 404)
  if (!conv.participantUids.includes(user.uid)) return apiError('Forbidden', 403)

  const body = await req.json().catch(() => ({}))
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!content) return apiError('content is required', 400)
  if (content.length > 32000) return apiError('content too long (32000 max)', 400)

  const userMessage = await appendMessage(convId, {
    role: 'user',
    content,
    status: 'completed',
    createdBy: user.uid,
  })
  await touchConversation(convId, {
    lastMessagePreview: content,
    lastMessageRole: 'user',
    title: conv.messageCount === 0 ? content.slice(0, 80) : undefined,
  })

  const assistantMessage = await appendMessage(convId, {
    role: 'assistant',
    content: '',
    status: 'pending',
    createdBy: user.uid,
  })

  const runResult = await createHermesRun(access.link, user.uid, {
    prompt: content,
    conversation_id: convId,
    metadata: {
      conversationId: convId,
      messageId: assistantMessage.id,
      orgId,
      source: 'partnersinbiz-web/chat',
    },
  })

  if (!runResult.response.ok) {
    return apiError('Hermes run request failed', runResult.response.status || 502, {
      hermes: runResult.data,
      userMessage,
      assistantMessage,
    })
  }

  const hermesPayload = runResult.data && typeof runResult.data === 'object' ? (runResult.data as Record<string, unknown>) : {}
  const runId = String(hermesPayload.run_id ?? hermesPayload.runId ?? hermesPayload.id ?? '')

  return apiSuccess({
    userMessage,
    assistantMessage,
    runId,
    runDocId: runResult.runDocId,
    hermes: runResult.data,
  })
})
