/**
 * POST /api/v1/conversations/[convId]/messages — add a message
 * GET  /api/v1/conversations/[convId]/messages — list messages
 *
 * Auth: participant in the conversation OR admin role
 *
 * Phase 1 (storage only):
 *   - User messages are stored immediately (authorKind='user').
 *   - When agent participants exist, a placeholder assistant message is created
 *     with status='pending'. Actual Hermes dispatch is Phase 2.
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  getConversation,
  createMessage,
  listMessages,
  touchConversation,
} from '@/lib/conversations/conversations'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ convId: string }> }

function canAccess(user: ApiUser, participantUids: string[]): boolean {
  if (user.role === 'admin' || user.role === 'ai') return true
  return participantUids.includes(user.uid)
}

export const POST = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { convId } = await (context as Params).params
    const conversation = await getConversation(convId)
    if (!conversation) return apiError('Conversation not found', 404)

    if (!canAccess(user, conversation.participantUids)) {
      return apiError('Forbidden', 403)
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') return apiError('Invalid JSON body', 400)

    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return apiError('content is required and must be a non-empty string', 400)

    // Resolve author display name from Firestore
    let authorDisplayName = user.uid
    const userDoc = await adminDb.collection('users').doc(user.uid).get()
    if (userDoc.exists) {
      const userData = userDoc.data() ?? {}
      authorDisplayName =
        (userData.displayName as string | undefined) ||
        (userData.email as string | undefined) ||
        user.uid
    }

    // Store the user message
    const message = await createMessage(convId, {
      conversationId: convId,
      role: 'user',
      content,
      authorKind: 'user',
      authorId: user.uid,
      authorDisplayName,
      status: 'completed',
    })

    // Update the conversation's denorm fields
    await touchConversation(convId, content, 'user')

    // Phase 1: create a pending placeholder for the first agent participant
    // Actual Hermes dispatch (Phase 2) will pick this up and stream the response.
    if (conversation.participantAgentIds.length > 0) {
      const agentId = conversation.participantAgentIds[0]
      // Resolve agent name
      const agentDoc = await adminDb.collection('agent_team').doc(agentId).get()
      const agentName = (agentDoc.data()?.name as string | undefined) ?? agentId

      await createMessage(convId, {
        conversationId: convId,
        role: 'assistant',
        content: '',
        authorKind: 'agent',
        authorId: agentId,
        authorDisplayName: agentName,
        status: 'pending',
      })
    }

    return apiSuccess({ message }, 201)
  },
)

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { convId } = await (context as Params).params
    const conversation = await getConversation(convId)
    if (!conversation) return apiError('Conversation not found', 404)

    if (!canAccess(user, conversation.participantUids)) {
      return apiError('Forbidden', 403)
    }

    const messages = await listMessages(convId, 200)
    return apiSuccess({ messages })
  },
)
