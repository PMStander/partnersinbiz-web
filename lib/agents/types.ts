/**
 * Agent Team types — shared across lib/agents, API routes, and the seed script.
 */
import type { Timestamp } from 'firebase-admin/firestore'

export type AgentId = 'pip' | 'theo' | 'maya' | 'sage' | 'nora'

export const AGENT_IDS: AgentId[] = ['pip', 'theo', 'maya', 'sage', 'nora']

export interface AgentTeamDoc {
  agentId: AgentId
  name: string
  role: string
  persona: string
  defaultModel: string
  iconKey: string       // material symbol name
  colorKey: string      // tailwind color token e.g. 'violet'
  enabled: boolean
  baseUrl: string
  apiKey: string        // stored AES-256-GCM encrypted; masked to last 6 chars in reads
  lastHealthCheck?: Timestamp
  lastHealthStatus?: 'ok' | 'degraded' | 'unreachable'
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** Shape stored in Firestore (apiKey is encrypted JSON) */
export interface AgentTeamStoredDoc extends Omit<AgentTeamDoc, 'apiKey'> {
  apiKey: string // JSON-serialised EncryptedData: { ciphertext, iv, tag }
}
